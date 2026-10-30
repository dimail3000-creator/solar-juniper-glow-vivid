import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Database,
  Download,
  HardDrive,
  Plus,
  RotateCcw,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  buildDump,
  formatBytes,
  formatMb,
  loadState,
  PG_VERSIONS,
  saveState,
  type PgVersion,
  type BackupJob,
  type ServerProfile,
  type VaultState,
} from "@/lib/vault";
import {
  diskFree,
  inspectDbServer,
  dumpPostgres,
  listKonturBackups,
  probePostgres,
  readKonturBackup,
  restorePostgres,
  rotateBackups,
  storeKonturBackup,
} from "@/lib/live.functions";
import { TOOL_META, TOOLS, backupPlan, restorePlan, type BackupKind, type BackupTool } from "@/lib/tools";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [state, setState] = useState<VaultState | null>(null);
  const [selectedId, setSelectedId] = useState<string>("srv-billing");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [targetDb, setTargetDb] = useState("");
  const [tool, setTool] = useState<BackupTool>("pgbackrest");
  const [kind, setKind] = useState<BackupKind>("full");
  const [keep, setKeep] = useState(7);
  const [disk, setDisk] = useState<{ total: number; free: number } | null>(null);
  const [remoteTools, setRemoteTools] = useState<
    Record<string, { id: BackupTool; installed: boolean; version: string | null }[]>
  >({});
  const [stored, setStored] = useState<{ path: string; bytes: number; mtime: string }[]>([]);

  async function refreshStored() {
    const listed = await listKonturBackups();
    if (listed.ok) setStored(listed.files);
  }

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setSelectedId(loaded.servers[0]?.id ?? "");
    void refreshStored().catch(() => setStored([]));
    void diskFree()
      .then((info) => setDisk({ total: info.total, free: info.free }))
      .catch(() => setDisk(null));
  }, []);

  useEffect(() => {
    if (!state) return;
    const now = new Date();
    const due = state.servers.find((item) => {
      const plan = item.schedule;
      if (!plan?.enabled) return false;
      if (now.getHours() < plan.hour) return false;
      const last = plan.lastRun ? new Date(plan.lastRun) : null;
      if (plan.every === "week") return !last || now.getTime() - last.getTime() > 6 * 24 * 3600 * 1000;
      return !last || last.toDateString() !== now.toDateString();
    });
    const database = due?.databases[0]?.name;
    if (!due || !database) return;
    commit({
      ...state,
      servers: state.servers.map((item) =>
        item.id === due.id ? { ...item, schedule: { ...item.schedule, lastRun: now.toISOString() } } : item,
      ),
    });
    const planTool = due.schedule.tool;
    const planKind = planTool === "pg_dump" ? "full" : due.schedule.kind;
    void (async () => {
      const sql =
        planTool === "pg_dump" && due.mode !== "live"
          ? buildDump(due, database)
          : backupPlan(planTool, due, database, planKind);
      await storeKonturBackup({
        data: { serverName: due.name, database, tool: planTool, kind: planKind, body: sql },
      });
      await rotateBackups({ data: { keep: due.schedule.keep, serverName: due.name } });
      await refreshStored();
      const info = await diskFree();
      setDisk({ total: info.total, free: info.free });
      setNotice(`Расписание ${due.name}: ${TOOL_META[planTool].title} записан в свой каталог`);
    })().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Расписание не выполнилось");
    });
  }, [state]);

  function commit(next: VaultState) {
    setState(next);
    saveState(next);
  }

  const server = state?.servers.find((s) => s.id === selectedId) ?? null;
  const jobs = useMemo(() => {
    if (!state) return [];
    return [...state.jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [state]);

  const totals = useMemo(() => {
    if (!state) return { servers: 0, backups: 0, bytes: 0 };
    const backups = state.jobs.filter((j) => j.kind === "backup" && j.status === "ok");
    return {
      servers: state.servers.length,
      backups: backups.length,
      bytes: backups.reduce((sum, j) => sum + j.bytes, 0),
    };
  }, [state]);

  async function backup(dbName: string) {
    if (!state || !server) return;
    setBusy(dbName);
    setNotice(null);
    try {
      let sql: string;
      let message: string;
      if (tool === "pg_dump" && server.mode === "live") {
        const result = await dumpPostgres({
          data: {
            host: server.host,
            port: server.port,
            user: server.user,
            password: server.password,
            database: dbName,
            ssl: server.ssl,
            maxRows: 40,
          },
        });
        if (!result.ok) throw new Error(result.error);
        sql = result.sql;
        message = "Дамп снят с узла и записан в свой каталог на Hamster";
      } else if (tool === "pg_dump") {
        await wait(400);
        sql = buildDump(server, dbName);
        message = "Полный демо-дамп записан в свой каталог на Hamster";
      } else {
        await wait(300);
        sql = backupPlan(tool, server, dbName, kind);
        message = `${TOOL_META[tool].title}, ${kind === "incr" ? "инкремент" : "полный"}. Каталог на Hamster.`;
      }
      const storedFile = await storeKonturBackup({
        data: {
          serverName: server.name,
          database: dbName,
          tool,
          kind: tool === "pg_dump" ? "full" : kind,
          body: sql,
        },
      });
      const job: BackupJob = {
        id: crypto.randomUUID(),
        serverId: server.id,
        serverName: server.name,
        database: dbName,
        createdAt: new Date().toISOString(),
        bytes: storedFile.bytes,
        sql: sql.slice(0, 4000),
        tool,
        backupKind: tool === "pg_dump" ? "full" : kind,
        storedPath: storedFile.path,
        status: "ok",
        kind: "backup",
        message,
      };
      await rotateBackups({ data: { keep: server.schedule?.keep ?? 7, serverName: server.name } });
      commit({ ...state, jobs: [job, ...state.jobs].slice(0, 40) });
      await refreshStored();
      setNotice(`${TOOL_META[tool].title}: свой каталог на Hamster, ретенция применена`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка дампа");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!state || !server || !restoreId) return;
    const job = state.jobs.find((j) => j.id === restoreId);
    if (!job || !targetDb) return;
    setBusy("restore");
    setNotice(null);
    try {
      const activeTool = job.tool ?? "pg_dump";
      if (activeTool === "pg_dump" && server.mode === "live") {
        const result = await restorePostgres({
          data: {
            host: server.host,
            port: server.port,
            user: server.user,
            password: server.password,
            database: targetDb,
            ssl: server.ssl,
            sql: job.sql,
          },
        });
        if (!result.ok) throw new Error(result.error);
      } else {
        await wait(600);
      }
      const script =
        activeTool === "pg_dump" ? job.sql : restorePlan(activeTool, server, job.database, targetDb);
      const record: BackupJob = {
        id: crypto.randomUUID(),
        serverId: server.id,
        serverName: server.name,
        database: targetDb,
        createdAt: new Date().toISOString(),
        bytes: new Blob([script]).size,
        sql: script,
        tool: activeTool,
        backupKind: job.backupKind ?? "full",
        status: "ok",
        kind: "restore",
        message:
          activeTool === "pg_dump"
            ? `Восстановлено pg_dump из ${job.database}`
            : `План ${TOOL_META[activeTool].title} для ${targetDb}`,
      };
      commit({ ...state, jobs: [record, ...state.jobs].slice(0, 40) });
      setRestoreId(null);
      setNotice(`База ${targetDb} восстановлена`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка восстановления");
    } finally {
      setBusy(null);
    }
  }

  async function testLive(profile: ServerProfile) {
    setBusy("probe");
    setNotice(null);
    const db = profile.databases[0]?.name || "postgres";
    const result = await probePostgres({
      data: {
        host: profile.host,
        port: profile.port,
        user: profile.user,
        password: profile.password,
        database: db,
        ssl: profile.ssl,
      },
    });
    setBusy(null);
    if (!state || !result.ok) {
      if (!result.ok) setNotice(result.error);
      return;
    }
    const databases = result.databases.map((row) => ({
      name: row.datname,
      sizeMb: 0,
      owner: profile.user,
      tables: [],
    }));
    const major = Math.floor(result.serverVersionNum / 10000);
    const pgVersion = (PG_VERSIONS as readonly number[]).includes(major) ? (major as PgVersion) : profile.pgVersion;
    commit({
      ...state,
      servers: state.servers.map((item) =>
        item.id === profile.id ? { ...item, databases, pgVersion } : item,
      ),
    });
    const sshUser = profile.sshUser || "postgres";
    const sshPort = profile.sshPort || 22;
    if (profile.mode !== "live") {
      setNotice(`PostgreSQL ${major}. Демо-узел: проверка средств по SSH пропускается.`);
      return;
    }
    const remote = await inspectDbServer({ data: { host: profile.host, sshPort, sshUser } });
    if (!remote.ok) {
      setNotice(`PostgreSQL ${major}. SSH ${sshUser}@${profile.host}: ${remote.error}`);
      return;
    }
    setRemoteTools((current) => ({ ...current, [profile.id]: remote.tools }));
    const ready = remote.tools.filter((item) => item.installed).map((item) => item.id);
    setNotice(
      ready.length
        ? `PostgreSQL ${major}. На сервере баз есть: ${ready.join(", ")}`
        : `PostgreSQL ${major}. На сервере баз ни одно средство не найдено`,
    );
  }

  function removeServer(id: string) {
    if (!state) return;
    const servers = state.servers.filter((s) => s.id !== id);
    commit({ ...state, servers });
    setSelectedId(servers[0]?.id ?? "");
  }

  function removeJob(id: string) {
    if (!state) return;
    commit({ ...state, jobs: state.jobs.filter((j) => j.id !== id) });
  }

  async function download(job: BackupJob) {
    let body = job.sql;
    if (job.storedPath) {
      const file = await readKonturBackup({ data: { path: job.storedPath } });
      if (!file.ok) {
        setNotice(file.error);
        return;
      }
      body = file.body;
    }
    const ext = (job.tool ?? "pg_dump") === "pg_dump" ? "sql" : "log";
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.serverName}-${job.database}-${job.tool ?? "pg_dump"}-${job.createdAt.slice(0, 16).replace(/[:T]/g, "")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!state) {
    return <main className="min-h-screen bg-bg p-8 text-muted">Загрузка Hamster…</main>;
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-primary uppercase">админ hamster</p>
            <h1 className="text-2xl font-medium tracking-tight">Hamster</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Бэкапы PostgreSQL: pgBackRest, Barman, pg_probackup или pg_dump. Расписание, полный или инкрементный тип,
              отдельный каталог и ретенция.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg"
          >
            <Plus className="size-4" />
            Свой узел
          </button>
        </div>
      </header>
      <section className="border-b border-border px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs text-muted">Каталоги бэкапов на Hamster</p>
          {disk && (
            <p className={`mt-1 text-sm ${disk.free / Math.max(disk.total, 1) < 0.15 ? "text-danger" : "text-fg"}`}>
              Свободно {formatBytes(disk.free)} из {formatBytes(disk.total)} (
              {Math.round((disk.free / Math.max(disk.total, 1)) * 100)}%)
              {disk.free / Math.max(disk.total, 1) < 0.15 ? " — мало места, запустите ротацию" : ""}
            </p>
          )}
          {stored.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Каталогов ещё нет. Каждый бэкап получает свой каталог.</p>
          ) : (
            <ul className="mt-2 grid gap-1">
              {stored.slice(0, 5).map((file) => (
                <li key={file.path} className="font-mono text-xs text-muted">
                  {file.path.split("/").slice(-2).join("/")} · {formatBytes(file.bytes)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-8 lg:grid-cols-[240px_1fr]">
        <section className="grid grid-cols-3 gap-2 lg:col-span-2">
          <Stat label="Серверы" value={String(totals.servers)} />
          <Stat label="Дампы" value={String(totals.backups)} />
          <Stat label="Архив" value={formatBytes(totals.bytes)} />
        </section>

        <aside className="flex flex-col gap-2 lg:row-start-2">
          {state.servers.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`rounded-xl border px-3 py-3 text-left ${
                item.id === selectedId ? "border-primary bg-surface-2" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Server className="size-4 text-primary" />
                {item.name}
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                {item.host}:{item.port}
              </p>
              <p className="mt-1 text-xs text-muted">
                PostgreSQL {item.pgVersion ?? 16} · {item.region} · {item.mode === "demo" ? "демо" : "живой"}
              </p>
            </button>
          ))}
          {state.servers.length === 0 && (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              Своих узлов пока нет.
            </p>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted"
          >
            <Plus className="size-4" />
            Добавить узел
          </button>
        </aside>

        <section className="flex flex-col gap-4 lg:row-start-2">
          {notice && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">{notice}</p>
          )}
          {server ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div>
                  <h2 className="text-lg font-medium">{server.name}</h2>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {server.user}@{server.host}:{server.port} · PostgreSQL {server.pgVersion ?? 16}
                    {server.ssl ? " · ssl" : " · без ssl"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {server.mode === "live" && (
                    <button
                      type="button"
                      disabled={busy === "probe"}
                      onClick={() => testLive(server)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                    >
                      <ShieldCheck className="size-4" />
                      Проверить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeServer(server.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-danger"
                  >
                    <Trash2 className="size-4" />
                    Убрать
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">Версия PostgreSQL</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PG_VERSIONS.map((version) => (
                    <button
                      key={version}
                      type="button"
                      onClick={() => {
                        commit({
                          ...state,
                          servers: state.servers.map((item) =>
                            item.id === server.id ? { ...item, pgVersion: version } : item,
                          ),
                        });
                      }}
                      className={`h-10 min-w-12 rounded-lg border px-3 font-mono text-sm ${
                        (server.pgVersion ?? 16) === version
                          ? "border-primary bg-surface-2 text-fg"
                          : "border-border text-muted"
                      }`}
                    >
                      {version}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted">
                  Клиент на сервере баз ищется по SSH ({server.sshUser || "postgres"}:{server.sshPort || 22}). Каталог копии остаётся на Hamster.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(remoteTools[server.id] ?? TOOLS.map((id) => ({ id, installed: false, version: null }))).map((item) => (
                  <span
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      item.installed ? "border-primary text-fg" : "border-border text-muted"
                    }`}
                  >
                    {TOOL_META[item.id].title}: {item.installed ? item.version : "на сервере баз не найдено"}
                  </span>
                ))}
              </div>

              <AddDatabase
                onAdd={(name) => {
                  if (server.databases.some((db) => db.name === name)) {
                    setNotice(`База ${name} уже есть`);
                    return;
                  }
                  commit({
                    ...state,
                    servers: state.servers.map((item) =>
                      item.id === server.id
                        ? {
                            ...item,
                            databases: [
                              ...item.databases,
                              { name, sizeMb: 0, owner: item.user, tables: [] },
                            ],
                          }
                        : item,
                    ),
                  });
                }}
              />

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">Средство</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TOOLS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTool(item)}
                      className={`h-10 rounded-lg border px-3 text-sm ${
                        tool === item ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"
                      }`}
                    >
                      {TOOL_META[item].title}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted">{TOOL_META[tool].blurb}</p>
                <p className="mt-3 text-xs text-muted">Тип</p>
                <div className="mt-2 flex gap-2">
                  {(["full", "incr"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setKind(item)}
                      className={`h-10 rounded-lg border px-3 text-sm ${
                        kind === item ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"
                      }`}
                    >
                      {item === "full" ? "Полный" : "Инкрементный"}
                    </button>
                  ))}
                </div>
              </div>

              <form
                className="rounded-xl border border-border bg-surface p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  commit({
                    ...state,
                    servers: state.servers.map((item) =>
                      item.id === server.id
                        ? {
                            ...item,
                            schedule: {
                              ...item.schedule,
                              enabled: true,
                              tool,
                              kind: tool === "pg_dump" ? "full" : kind,
                              keep,
                            },
                          }
                        : item,
                    ),
                  });
                  setNotice(
                    `Расписание: ${tool === "pg_dump" ? "полный pg_dump" : kind === "incr" ? "инкремент" : "полный"} ${TOOL_META[tool].title}, хранить ${keep}`,
                  );
                }}
              >
                <p className="text-xs text-muted">Расписание · {server.schedule?.enabled ? "включено" : "выключено"}</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted">
                    Когда
                    <select
                      value={server.schedule?.every ?? "day"}
                      onChange={(event) => {
                        const every = event.target.value === "week" ? "week" : "day";
                        commit({
                          ...state,
                          servers: state.servers.map((item) =>
                            item.id === server.id ? { ...item, schedule: { ...item.schedule, every } } : item,
                          ),
                        });
                      }}
                      className="mt-1 block h-10 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
                    >
                      <option value="day">каждый день</option>
                      <option value="week">раз в неделю</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    Час
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={server.schedule?.hour ?? 2}
                      onChange={(event) => {
                        const hour = Math.min(23, Math.max(0, Number(event.target.value) || 0));
                        commit({
                          ...state,
                          servers: state.servers.map((item) =>
                            item.id === server.id ? { ...item, schedule: { ...item.schedule, hour } } : item,
                          ),
                        });
                      }}
                      className="mt-1 block h-10 w-20 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Хранить
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={keep}
                      onChange={(event) => setKeep(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
                      className="mt-1 block h-10 w-20 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
                    />
                  </label>
                  <button type="submit" className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg">
                    Сохранить расписание
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-lg border border-border px-3 text-sm"
                    onClick={() => {
                      void rotateBackups({ data: { keep } }).then(async (result) => {
                        await refreshStored();
                        const info = await diskFree();
                        setDisk({ total: info.total, free: info.free });
                        setNotice(result.removed ? `Ретенция удалила каталогов: ${result.removed}` : "Старых каталогов нет");
                      });
                    }}
                  >
                    Ротация
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Сейчас: {server.schedule?.every === "week" ? "еженедельно" : "ежедневно"} в {server.schedule?.hour ?? 2}:00,{" "}
                  {server.schedule?.tool ? TOOL_META[server.schedule.tool].title : "средство не выбрано"}, хранить{" "}
                  {server.schedule?.keep ?? keep}. Ротация удаляет каталоги старше лимита.
                </p>
              </form>

              <div className="grid gap-3">
                {server.databases.map((db) => (
                  <article key={db.name} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Database className="size-4 text-primary" />
                        <h3 className="font-medium">{db.name}</h3>
                        <span className="font-mono text-xs text-muted">{formatMb(db.sizeMb)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={busy === db.name}
                        onClick={() => backup(db.name)}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg disabled:opacity-60"
                      >
                        <HardDrive className="size-4" />
                        {busy === db.name ? "Снимаю…" : `Бэкап · ${TOOL_META[tool].title}`}
                      </button>
                    </div>
                    <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                      {db.tables.map((table) => (
                        <li key={table.name} className="font-mono text-xs text-muted">
                          {table.name} · {table.rows.toLocaleString("ru-RU")} строк
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Выберите сервер.</p>
          )}

          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Журнал</div>
            <ul className="divide-y divide-border">
              {jobs.length === 0 && <li className="px-4 py-6 text-sm text-muted">Операций ещё не было.</li>}
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm">
                      {job.kind === "backup" ? "Бэкап" : "Восстановление"} · {TOOL_META[job.tool ?? "pg_dump"].title} ·{" "}
                      {job.database}
                    </p>
                    <p className="text-xs text-muted">
                      {job.serverName} · {new Date(job.createdAt).toLocaleString("ru-RU")} · {formatBytes(job.bytes)}
                    </p>
                    <p className="text-xs text-muted">{job.message}</p>
                  </div>
                  <div className="flex gap-2">
                    {job.kind === "backup" && job.status === "ok" && (
                      <>
                        <button
                          type="button"
                          onClick={() => download(job)}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm"
                        >
                          <Download className="size-4" />
                          {(job.tool ?? "pg_dump") === "pg_dump" ? "SQL" : "Скрипт"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRestoreId(job.id);
                            setTargetDb(server?.databases[0]?.name ?? job.database);
                          }}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm"
                        >
                          <RotateCcw className="size-4" />
                          Вернуть
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeJob(job.id)}
                      className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted"
                      aria-label="Удалить запись"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {adding && (
        <AddServer
          onClose={() => setAdding(false)}
          onSave={(profile) => {
            commit({ ...state, servers: [...state.servers, profile] });
            setSelectedId(profile.id);
            setAdding(false);
          }}
        />
      )}

      {restoreId && server && (
        <dialog open className="fixed inset-0 z-20 m-0 flex h-full w-full items-end justify-center bg-black/50 p-4 sm:items-center">
          <form
            className="w-full max-w-md rounded-xl border border-border bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void restore();
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium">Восстановление</h2>
              <button type="button" onClick={() => setRestoreId(null)} aria-label="Закрыть">
                <X className="size-4" />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted">
              {(state.jobs.find((j) => j.id === restoreId)?.tool ?? "pg_dump") === "pg_dump"
                ? "Дамп pg_dump применится к выбранной базе. На живом узле SQL выполняется сразу, на демо фиксируется в журнале."
                : `Для ${TOOL_META[state.jobs.find((j) => j.id === restoreId)?.tool ?? "pg_dump"].title} в журнал запишется команда восстановления. Её запускают на хосте бэкапа, не из браузера.`}
            </p>
            <label className="mb-1 block text-xs text-muted" htmlFor="target-db">
              Целевая база
            </label>
            <select
              id="target-db"
              value={targetDb}
              onChange={(event) => setTargetDb(event.target.value)}
              className="mb-4 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm"
            >
              {server.databases.map((db) => (
                <option key={db.name} value={db.name}>
                  {db.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy === "restore"}
              className="h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg disabled:opacity-60"
            >
              {busy === "restore" ? "Восстанавливаю…" : "Восстановить"}
            </button>
          </form>
        </dialog>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

function AddServer({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (server: ServerProfile) => void;
}) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [user, setUser] = useState("postgres");
  const [password, setPassword] = useState("");
  const [databasesText, setDatabasesText] = useState("postgres");
  const [ssl, setSsl] = useState(true);
  const [pgVersion, setPgVersion] = useState<PgVersion>(16);
  const [sshUser, setSshUser] = useState("postgres");
  const [sshPort, setSshPort] = useState("22");
  const [error, setError] = useState("");

  return (
    <dialog open className="fixed inset-0 z-20 m-0 flex h-full max-h-none w-full items-end justify-center bg-black/50 p-4 sm:items-center">
      <form
        noValidate
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const portNum = Number(port);
          const sshPortNum = Number(sshPort);
          if (!name.trim() || !host.trim()) {
            setError("Укажите имя узла и хост.");
            return;
          }
          if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
            setError("Порт PostgreSQL должен быть числом от 1 до 65535.");
            return;
          }
          if (!Number.isInteger(sshPortNum) || sshPortNum < 1 || sshPortNum > 65535) {
            setError("SSH-порт должен быть числом от 1 до 65535.");
            return;
          }
          const names = databasesText
            .split(/[\s,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
          const unique = [...new Set(names.length ? names : ["postgres"])];
          const bad = unique.find((dbName) => !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(dbName));
          if (bad) {
            setError(`Имя базы «${bad}» не подходит. Буквы, цифры, _ и -.`);
            return;
          }
          setError("");
          onSave({
            id: crypto.randomUUID(),
            name: name.trim(),
            host: host.trim(),
            port: portNum,
            user: user.trim() || "postgres",
            password,
            ssl,
            region: "свой",
            pgVersion,
            sshUser: sshUser.trim() || "postgres",
            sshPort: sshPortNum,
            schedule: {
              enabled: false,
              every: "day",
              hour: 2,
              tool: "pgbackrest",
              kind: "full",
              keep: 7,
            },
            mode: "live",
            databases: unique.map((dbName) => ({
              name: dbName,
              sizeMb: 0,
              owner: user.trim() || "postgres",
              tables: [],
            })),
          });
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Свой узел</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Пароль базы остаётся в браузере. Проверка средств идёт по SSH на сервер баз. Каталог бэкапа создаётся на Hamster.
        </p>
        <div className="grid gap-2">
          <Field label="Имя узла" value={name} onChange={setName} />
          <Field label="Хост" value={host} onChange={setHost} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Порт PostgreSQL" value={port} onChange={setPort} />
            <Field label="Пользователь базы" value={user} onChange={setUser} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SSH-пользователь" value={sshUser} onChange={setSshUser} />
            <Field label="SSH-порт" value={sshPort} onChange={setSshPort} />
          </div>
          <Field label="Базы через запятую" value={databasesText} onChange={setDatabasesText} />
          <Field label="Пароль" value={password} onChange={setPassword} secret />
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={ssl} onChange={(event) => setSsl(event.target.checked)} />
            Требовать SSL
          </label>
          <div>
            <p className="text-xs text-muted">Версия</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {PG_VERSIONS.map((version) => (
                <button
                  key={version}
                  type="button"
                  onClick={() => setPgVersion(version)}
                  className={`h-10 min-w-12 rounded-lg border px-3 font-mono text-sm ${
                    pgVersion === version ? "border-primary bg-bg text-fg" : "border-border text-muted"
                  }`}
                >
                  {version}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button type="submit" className="mt-3 h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg">
          Добавить узел
        </button>
      </form>
    </dialog>
  );
}

function AddDatabase({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(next)) {
          setError("Имя базы: с буквы или _, дальше буквы, цифры, _ и -.");
          return;
        }
        setError("");
        onAdd(next);
        setName("");
      }}
    >
      <label className="min-w-40 flex-1 text-xs text-muted">
        База на этом узле
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="app_db"
          className="mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"
        />
      </label>
      <button type="submit" className="h-11 rounded-lg border border-border px-3 text-sm">
        Добавить базу
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        required={false}
        type={secret ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"
      />
    </label>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
