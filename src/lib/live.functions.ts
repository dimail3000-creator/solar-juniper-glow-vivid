import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const connSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(63),
  password: z.string().max(256),
  database: z.string().trim().min(1).max(63),
  ssl: z.boolean(),
});

type Conn = z.infer<typeof connSchema>;

async function withClient<T>(data: Conn, run: (client: import("pg").Client) => Promise<T>): Promise<T> {
  const pg = await import("pg");
  const client = new pg.Client({
    host: data.host,
    port: data.port,
    user: data.user,
    password: data.password,
    database: data.database,
    ssl: data.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
    statement_timeout: 20000,
    query_timeout: 20000,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export const probePostgres = createServerFn({ method: "POST" })
  .validator(connSchema)
  .handler(async ({ data }) => {
    try {
      const found = await withClient(data, async (client) => {
        const res = await client.query<{ datname: string; size: string }>(
          `SELECT d.datname,
                  pg_size_pretty(pg_database_size(d.datname)) AS size
             FROM pg_database d
            WHERE d.datistemplate = false
            ORDER BY 1`,
        );
        const version = await client.query<{ server_version_num: string }>("SHOW server_version_num");
        return {
          databases: res.rows,
          serverVersionNum: Number(version.rows[0]?.server_version_num ?? 0),
        };
      });
      return { ok: true as const, ...found };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подключиться";
      return { ok: false as const, error: message };
    }
  });

const dumpSchema = connSchema.extend({
  maxRows: z.number().int().min(1).max(200).default(40),
});

export const dumpPostgres = createServerFn({ method: "POST" })
  .validator(dumpSchema)
  .handler(async ({ data }) => {
    try {
      const sql = await withClient(data, async (client) => {
        const tables = await client.query<{ table_name: string }>(
          `SELECT table_name
             FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY 1
            LIMIT 25`,
        );
        const lines = [
          `-- Kontur logical dump`,
          `-- host: ${data.host} database: ${data.database}`,
          `-- generated: ${new Date().toISOString()}`,
          `BEGIN;`,
          ``,
        ];
        for (const table of tables.rows) {
          const name = table.table_name;
          if (!/^[a-z_][a-z0-9_]*$/i.test(name)) continue;
          const cols = await client.query<{ column_name: string; data_type: string }>(
            `SELECT column_name, data_type
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1
              ORDER BY ordinal_position`,
            [name],
          );
          const colList = cols.rows.map((c) => `"${c.column_name}"`).join(", ");
          const defs = cols.rows
            .map((c) => `"${c.column_name}" ${c.data_type === "USER-DEFINED" ? "text" : c.data_type}`)
            .join(", ");
          lines.push(`CREATE TABLE IF NOT EXISTS public."${name}" (${defs});`);
          const rows = await client.query(
            `SELECT ${colList} FROM public."${name}" LIMIT ${data.maxRows}`,
          );
          if (rows.rows.length) {
            const values = rows.rows.map((row) => {
              const cells = cols.rows.map((c) => sqlLiteral(row[c.column_name]));
              return `(${cells.join(", ")})`;
            });
            lines.push(`INSERT INTO public."${name}" (${colList}) VALUES`);
            lines.push(`${values.join(",\n")};`);
          }
          lines.push("");
        }
        lines.push("COMMIT;");
        return lines.join("\n");
      });
      return { ok: true as const, sql };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Дамп не удался";
      return { ok: false as const, error: message };
    }
  });

const restoreSchema = connSchema.extend({
  sql: z.string().min(1).max(1_500_000),
});

export const restorePostgres = createServerFn({ method: "POST" })
  .validator(restoreSchema)
  .handler(async ({ data }) => {
    if (!data.sql.includes("-- Kontur logical dump")) {
      return { ok: false as const, error: "Можно восстанавливать только дампы Контура" };
    }
    try {
      await withClient(data, async (client) => {
        await client.query("BEGIN");
        const statements = data.sql
          .split(/;\s*\n/)
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("--") && !/^BEGIN$/i.test(s) && !/^COMMIT$/i.test(s));
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query("COMMIT");
      });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Восстановление не удалось";
      return { ok: false as const, error: message };
    }
  });

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function firstLine(
  exec: (bin: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  bin: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(bin, args);
    const line = `${stdout}\n${stderr}`
      .split("\n")
      .map((item) => item.trim())
      .find(Boolean);
    return line ? line.slice(0, 180) : null;
  } catch {
    return null;
  }
}

export const detectHostTools = createServerFn({ method: "GET" }).handler(async () => {
  const { execFile } = await import("node:child_process");
  const { readdir } = await import("node:fs/promises");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const run = (bin: string, args: string[]) =>
    exec(bin, args, { timeout: 4000 }).then((result) => ({
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    }));
  const clients: { major: number; path: string; version: string }[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir("/usr/lib/postgresql");
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    const major = Number(entry);
    if (!Number.isInteger(major)) continue;
    const path = `/usr/lib/postgresql/${entry}/bin/pg_dump`;
    const version = await firstLine(run, path, ["--version"]);
    if (version) clients.push({ major, path, version });
  }
  const pathDump = await firstLine(run, "pg_dump", ["--version"]);
  if (pathDump && !clients.some((item) => item.version === pathDump)) {
    const major = Number(pathDump.match(/\b(\d+)\.\d+/)?.[1] ?? 0);
    clients.push({ major, path: "pg_dump", version: pathDump });
  }

  const checks: { id: "pg_dump" | "pgbackrest" | "barman" | "pg_probackup"; bin: string; args: string[] }[] = [
    { id: "pg_dump", bin: "pg_dump", args: ["--version"] },
    { id: "pgbackrest", bin: "pgbackrest", args: ["version"] },
    { id: "barman", bin: "barman", args: ["-v"] },
    { id: "pg_probackup", bin: "pg_probackup", args: ["--version"] },
  ];
  const tools = [];
  for (const check of checks) {
    const version = check.id === "pg_dump" && pathDump ? pathDump : await firstLine(run, check.bin, check.args);
    tools.push({
      id: check.id,
      installed: Boolean(version),
      version,
    });
  }
  return { clients, tools };
});

const sshSchema = z.object({
  host: z.string().regex(/^[A-Za-z0-9._-]{1,253}$/),
  sshPort: z.number().int().min(1).max(65535),
  sshUser: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/i),
});

const ident = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/);

function sshArgs(data: z.infer<typeof sshSchema>, remote: string[]): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=8",
    "-p",
    String(data.sshPort),
    `${data.sshUser}@${data.host}`,
    ...remote,
  ];
}

async function runSsh(data: z.infer<typeof sshSchema>, remote: string[], maxBuffer = 1_000_000) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  return exec("ssh", sshArgs(data, remote), { timeout: 20000, maxBuffer });
}

export const inspectDbServer = createServerFn({ method: "POST" })
  .validator(sshSchema)
  .handler(async ({ data }) => {
    const script = [
      "for b in pg_dump pgbackrest barman pg_probackup; do",
      "  if command -v \"$b\" >/dev/null 2>&1; then",
      "    printf '%s\\t' \"$b\"",
      "    case \"$b\" in",
      "      pgbackrest) pgbackrest version 2>&1 | head -n 1 ;;",
      "      pg_probackup) pg_probackup --version 2>&1 | head -n 1 ;;",
      "      barman) barman -v 2>&1 | head -n 1 ;;",
      "      *) \"$b\" --version 2>&1 | head -n 1 ;;",
      "    esac",
      "  else",
      "    printf '%s\\tmissing\\n' \"$b\"",
      "  fi",
      "done",
    ].join("\n");
    try {
      const { stdout } = await runSsh(data, ["sh", "-c", script]);
      const tools = String(stdout)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [id, ...rest] = line.split("\t");
          const version = rest.join("\t").trim();
          return {
            id: id as "pg_dump" | "pgbackrest" | "barman" | "pg_probackup",
            installed: version !== "missing" && version.length > 0,
            version: version === "missing" ? null : version.slice(0, 180),
          };
        });
      return { ok: true as const, tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SSH к серверу баз не удался";
      return { ok: false as const, error: message };
    }
  });

const storeSchema = z.object({
  serverName: z.string().trim().min(1).max(80),
  database: ident,
  tool: z.enum(["pg_dump", "pgbackrest", "barman", "pg_probackup"]),
  kind: z.enum(["full", "incr"]),
  body: z.string().max(4_000_000),
});

function backupRoot() {
  return `${process.cwd()}/data/backups`;
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

export const storeKonturBackup = createServerFn({ method: "POST" })
  .validator(storeSchema)
  .handler(async ({ data }) => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = `${backupRoot()}/${safeSegment(data.serverName)}/${stamp}-${safeSegment(data.database)}-${data.tool}-${data.kind}`;
    await mkdir(dir, { recursive: true });
    const ext = data.tool === "pg_dump" ? "sql" : "log";
    const file = `${dir}/backup.${ext}`;
    const meta = [
      `tool=${data.tool}`,
      `kind=${data.kind}`,
      `database=${data.database}`,
      `server=${data.serverName}`,
      `created=${new Date().toISOString()}`,
      "",
    ].join("\n");
    await writeFile(`${dir}/meta.txt`, meta, "utf8");
    await writeFile(file, data.body, "utf8");
    return { ok: true as const, path: dir, bytes: Buffer.byteLength(data.body) + Buffer.byteLength(meta) };
  });

export const listKonturBackups = createServerFn({ method: "GET" }).handler(async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const root = backupRoot();
  try {
    const servers = await readdir(root);
    const files: { path: string; bytes: number; mtime: string }[] = [];
    for (const server of servers) {
      const dir = `${root}/${server}`;
      const names = await readdir(dir);
      for (const name of names) {
        const path = `${dir}/${name}`;
        const info = await stat(path);
        if (!info.isDirectory()) continue;
        const inner = await readdir(path);
        let bytes = 0;
        for (const file of inner) {
          const fileInfo = await stat(`${path}/${file}`);
          if (fileInfo.isFile()) bytes += fileInfo.size;
        }
        files.push({ path, bytes, mtime: info.mtime.toISOString() });
      }
    }
    files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return { ok: true as const, files: files.slice(0, 40) };
  } catch {
    return { ok: true as const, files: [] as { path: string; bytes: number; mtime: string }[] };
  }
});

export const diskFree = createServerFn({ method: "GET" }).handler(async () => {
  const { statfs } = await import("node:fs/promises");
  const { mkdir } = await import("node:fs/promises");
  const root = backupRoot();
  await mkdir(root, { recursive: true });
  const stats = await statfs(root);
  const block = Number(stats.bsize);
  return {
    path: root,
    total: block * Number(stats.blocks),
    free: block * Number(stats.bavail),
  };
});

export const rotateBackups = createServerFn({ method: "POST" })
  .validator(
    z.object({
      keep: z.number().int().min(1).max(100),
      serverName: z.string().trim().min(1).max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { readdir, stat, rm } = await import("node:fs/promises");
    const root = backupRoot();
    const scope = data.serverName ? `${root}/${safeSegment(data.serverName)}` : root;
    const dirs: { path: string; mtime: number }[] = [];
    try {
      if (data.serverName) {
        for (const name of await readdir(scope)) {
          const path = `${scope}/${name}`;
          const info = await stat(path);
          if (info.isDirectory()) dirs.push({ path, mtime: info.mtimeMs });
        }
      } else {
        for (const server of await readdir(root)) {
          const serverDir = `${root}/${server}`;
          for (const name of await readdir(serverDir)) {
            const path = `${serverDir}/${name}`;
            const info = await stat(path);
            if (info.isDirectory()) dirs.push({ path, mtime: info.mtimeMs });
          }
        }
      }
    } catch {
      return { ok: true as const, removed: 0 };
    }
    dirs.sort((a, b) => b.mtime - a.mtime);
    const stale = dirs.slice(data.keep);
    for (const dir of stale) await rm(dir.path, { recursive: true, force: true });
    return { ok: true as const, removed: stale.length };
  });

const readSchema = z.object({ path: z.string().min(1).max(300) });

export const readKonturBackup = createServerFn({ method: "POST" })
  .validator(readSchema)
  .handler(async ({ data }) => {
    const root = backupRoot();
    if (!data.path.startsWith(`${root}/`) || data.path.includes("..")) {
      return { ok: false as const, error: "Путь вне хранилища Hamster" };
    }
    const { readFile, readdir } = await import("node:fs/promises");
    let file = data.path;
    try {
      const names = await readdir(data.path);
      const payload = names.find((name) => name.startsWith("backup."));
      if (payload) file = `${data.path}/${payload}`;
    } catch {
      file = data.path;
    }
    const body = await readFile(file, "utf8");
    return { ok: true as const, body };
  });

