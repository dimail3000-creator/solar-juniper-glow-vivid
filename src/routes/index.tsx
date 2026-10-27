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
import { detectHostTools, dumpPostgres, probePostgres, restorePostgres } from "@/lib/live.functions";
import { TOOL_META, TOOLS, backupPlan, restorePlan, type BackupTool } from "@/lib/tools";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [state, setState] = useState<VaultState | null>(null);
  const [selectedId, setSelectedId] = useState<string>("srv-billing");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [targetDb, setTargetDb] = useState("");
  const [tool, setTool] = useState<BackupTool>("pg_dump");
  const [hostTools, setHostTools] = useState<Awaited<ReturnType<typeof detectHostTools>> | null>(null);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setSelectedId(loaded.servers[0]?.id ?? "");
    void detectHostTools()
      .then(setHostTools)
      .catch(() => setHostTools({ clients: [], tools: [] }));
  }, []);

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
        message = "Снят живой логический дамп pg_dump";
      } else if (tool === "pg_dump") {
        await wait(700);
        sql = buildDump(server, dbName);
        message = "Снят дамп pg_dump по каталогу демо-узла";
      } else {
        await wait(500);
        sql = backupPlan(tool, server, dbName);
        message = `План ${TOOL_META[tool].title} для хоста бэкапа`;
      }
      const job: BackupJob = {
        id: crypto.randomUUID(),
        serverId: server.id,
        serverName: server.name,
        database: dbName,
        createdAt: new Date().toISOString(),
        bytes: new Blob([sql]).size,
        sql,
        tool,
        status: "ok",
        kind: "backup",
        message,
      };
      commit({ ...state, jobs: [job, ...state.jobs].slice(0, 40) });
      setNotice(`${TOOL_META[tool].title}: ${dbName} готов`);
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
    const client = hostTools?.clients.find((item) => item.major === major);
    setNotice(
      client
        ? `PostgreSQL ${major} на узле, клиент pg_dump ${major} найден`
        : `PostgreSQL ${major} на узле. Подходящий клиент pg_dump на этом хосте не найден. Баз: ${databases.length}`,
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

  function download(job: BackupJob) {
    const ext = (job.tool ?? "pg_dump") === "pg_dump" ? "sql" : "sh";
    const blob = new Blob([job.sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.serverName}-${job.database}-${job.tool ?? "pg_dump"}-${job.createdAt.slice(0, 16).replace(/[:T]/g, "")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!state) {
    return <main className="min-h-screen bg-bg p-8 text-muted">Загрузка контура…</main>;
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-primary uppercase">PostgreSQL</p>
            <h1 className="text-2xl font-medium tracking-tight">Контур</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Резервные копии и восстановление баз на удалённых серверах. Средство выбирается для каждой операции:
              pg_dump, pgBackRest, Barman или wal-g.
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
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-xs text-muted">Средства на этом хосте</p>
          <div className="flex flex-wrap gap-2">
            {(hostTools?.tools ?? TOOLS.map((id) => ({ id, installed: false, version: null }))).map((item) => (
              <span
                key={item.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  item.installed ? "border-primary text-fg" : "border-border text-muted"
                }`}
              >
                {TOOL_META[item.id].title}: {item.installed ? item.version : "не установлено"}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted">
            {hostTools && hostTools.clients.length > 0
              ? `Клиенты pg_dump: ${hostTools.clients.map((item) => String(item.major)).join(", ")}`
              : "Клиенты pg_dump в /usr/lib/postgresql не найдены. Версия узла всё равно читается по SHOW server_version_num."}
          </p>
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
                  Клиент pg_dump и pg_restore берётся из /usr/lib/postgresql/{server.pgVersion ?? 16}/bin — не старше сервера.
                </p>
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
              </div>

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

  return (
    <dialog open className="fixed inset-0 z-20 m-0 flex h-full w-full items-end justify-center bg-black/50 p-4 sm:items-center">
      <form
        className="w-full max-w-md rounded-xl border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const portNum = Number(port);
          if (!name.trim() || !host.trim() || !Number.isInteger(portNum)) return;
          const names = databasesText
            .split(/[\s,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
          const unique = [...new Set(names.length ? names : ["postgres"])];
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
          Пароль остаётся в браузере. Несколько баз — через запятую. «Проверить» на карточке узла подтянет реальный список с хоста.
        </p>
        <div className="grid gap-2">
          <Field label="Имя узла" value={name} onChange={setName} />
          <Field label="Хост" value={host} onChange={setHost} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Порт" value={port} onChange={setPort} />
            <Field label="Пользователь" value={user} onChange={setUser} />
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
        <button type="submit" className="mt-3 h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg">
          Добавить узел
        </button>
      </form>
    </dialog>
  );
}

function AddDatabase({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim();
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(next)) return;
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
        required={label !== "Пароль"}
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
