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
      const databases = await withClient(data, async (client) => {
        const res = await client.query<{ datname: string; size: string }>(
          `SELECT d.datname,
                  pg_size_pretty(pg_database_size(d.datname)) AS size
             FROM pg_database d
            WHERE d.datistemplate = false
            ORDER BY 1`,
        );
        return res.rows;
      });
      return { ok: true as const, databases };
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
