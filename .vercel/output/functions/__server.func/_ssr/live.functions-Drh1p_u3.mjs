import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as string, i as object, r as number, t as boolean } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/live.functions-Drh1p_u3.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var connSchema = object({
	host: string().trim().min(1).max(253),
	port: number().int().min(1).max(65535),
	user: string().trim().min(1).max(63),
	password: string().max(256),
	database: string().trim().min(1).max(63),
	ssl: boolean()
});
async function withClient(data, run) {
	const client = new (await (import("../_libs/pg.mjs").then((n) => n.t))).Client({
		host: data.host,
		port: data.port,
		user: data.user,
		password: data.password,
		database: data.database,
		ssl: data.ssl ? { rejectUnauthorized: false } : false,
		connectionTimeoutMillis: 8e3,
		statement_timeout: 2e4,
		query_timeout: 2e4
	});
	await client.connect();
	try {
		return await run(client);
	} finally {
		await client.end().catch(() => void 0);
	}
}
var probePostgres_createServerFn_handler = createServerRpc({
	id: "77cea8f8871a32830620ada5284809abb8f6d06a86642133428f0c21c4575375",
	name: "probePostgres",
	filename: "src/lib/live.functions.ts"
}, (opts) => probePostgres.__executeServer(opts));
var probePostgres = createServerFn({ method: "POST" }).validator(connSchema).handler(probePostgres_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			...await withClient(data, async (client) => {
				const res = await client.query(`SELECT d.datname,
                  pg_size_pretty(pg_database_size(d.datname)) AS size
             FROM pg_database d
            WHERE d.datistemplate = false
            ORDER BY 1`);
				const version = await client.query("SHOW server_version_num");
				return {
					databases: res.rows,
					serverVersionNum: Number(version.rows[0]?.server_version_num ?? 0)
				};
			})
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Не удалось подключиться"
		};
	}
});
var dumpSchema = connSchema.extend({ maxRows: number().int().min(1).max(200).default(40) });
var dumpPostgres_createServerFn_handler = createServerRpc({
	id: "37ce827c1a1bc543a1b396d8fd93bac320c97e1c436046bb4690d65607b891b0",
	name: "dumpPostgres",
	filename: "src/lib/live.functions.ts"
}, (opts) => dumpPostgres.__executeServer(opts));
var dumpPostgres = createServerFn({ method: "POST" }).validator(dumpSchema).handler(dumpPostgres_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			sql: await withClient(data, async (client) => {
				const tables = await client.query(`SELECT table_name
             FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY 1
            LIMIT 25`);
				const lines = [
					`-- Kontur logical dump`,
					`-- host: ${data.host} database: ${data.database}`,
					`-- generated: ${(/* @__PURE__ */ new Date()).toISOString()}`,
					`BEGIN;`,
					``
				];
				for (const table of tables.rows) {
					const name = table.table_name;
					if (!/^[a-z_][a-z0-9_]*$/i.test(name)) continue;
					const cols = await client.query(`SELECT column_name, data_type
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1
              ORDER BY ordinal_position`, [name]);
					const colList = cols.rows.map((c) => `"${c.column_name}"`).join(", ");
					const defs = cols.rows.map((c) => `"${c.column_name}" ${c.data_type === "USER-DEFINED" ? "text" : c.data_type}`).join(", ");
					lines.push(`CREATE TABLE IF NOT EXISTS public."${name}" (${defs});`);
					const rows = await client.query(`SELECT ${colList} FROM public."${name}" LIMIT ${data.maxRows}`);
					if (rows.rows.length) {
						const values = rows.rows.map((row) => {
							return `(${cols.rows.map((c) => sqlLiteral(row[c.column_name])).join(", ")})`;
						});
						lines.push(`INSERT INTO public."${name}" (${colList}) VALUES`);
						lines.push(`${values.join(",\n")};`);
					}
					lines.push("");
				}
				lines.push("COMMIT;");
				return lines.join("\n");
			})
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Дамп не удался"
		};
	}
});
var restoreSchema = connSchema.extend({ sql: string().min(1).max(15e5) });
var restorePostgres_createServerFn_handler = createServerRpc({
	id: "b5e66b277df4a328740ba1c66e5f5fd295bfd026ad5802204e3d1f2353b45764",
	name: "restorePostgres",
	filename: "src/lib/live.functions.ts"
}, (opts) => restorePostgres.__executeServer(opts));
var restorePostgres = createServerFn({ method: "POST" }).validator(restoreSchema).handler(restorePostgres_createServerFn_handler, async ({ data }) => {
	if (!data.sql.includes("-- Kontur logical dump")) return {
		ok: false,
		error: "Можно восстанавливать только дампы Контура"
	};
	try {
		await withClient(data, async (client) => {
			await client.query("BEGIN");
			const statements = data.sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("--") && !/^BEGIN$/i.test(s) && !/^COMMIT$/i.test(s));
			for (const statement of statements) await client.query(statement);
			await client.query("COMMIT");
		});
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Восстановление не удалось"
		};
	}
});
function sqlLiteral(value) {
	if (value === null || value === void 0) return "NULL";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	if (value instanceof Date) return `'${value.toISOString()}'`;
	if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
	return `'${String(value).replaceAll("'", "''")}'`;
}
async function firstLine(exec, bin, args) {
	try {
		const { stdout, stderr } = await exec(bin, args);
		const line = `${stdout}\n${stderr}`.split("\n").map((item) => item.trim()).find(Boolean);
		return line ? line.slice(0, 180) : null;
	} catch {
		return null;
	}
}
var detectHostTools_createServerFn_handler = createServerRpc({
	id: "af73ff3bbcae638eba2ad015abeebd3c82ba45a07d6985cb1996c5fbf249122b",
	name: "detectHostTools",
	filename: "src/lib/live.functions.ts"
}, (opts) => detectHostTools.__executeServer(opts));
var detectHostTools = createServerFn({ method: "GET" }).handler(detectHostTools_createServerFn_handler, async () => {
	const { execFile } = await import("node:child_process");
	const { readdir } = await import("node:fs/promises");
	const { promisify } = await import("node:util");
	const exec = promisify(execFile);
	const run = (bin, args) => exec(bin, args, { timeout: 4e3 }).then((result) => ({
		stdout: String(result.stdout),
		stderr: String(result.stderr)
	}));
	const clients = [];
	let entries = [];
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
		if (version) clients.push({
			major,
			path,
			version
		});
	}
	const pathDump = await firstLine(run, "pg_dump", ["--version"]);
	if (pathDump && !clients.some((item) => item.version === pathDump)) {
		const major = Number(pathDump.match(/\b(\d+)\.\d+/)?.[1] ?? 0);
		clients.push({
			major,
			path: "pg_dump",
			version: pathDump
		});
	}
	const checks = [
		{
			id: "pg_dump",
			bin: "pg_dump",
			args: ["--version"]
		},
		{
			id: "pgbackrest",
			bin: "pgbackrest",
			args: ["version"]
		},
		{
			id: "barman",
			bin: "barman",
			args: ["-v"]
		},
		{
			id: "wal-g",
			bin: "wal-g",
			args: ["--version"]
		}
	];
	const tools = [];
	for (const check of checks) {
		const version = check.id === "pg_dump" && pathDump ? pathDump : await firstLine(run, check.bin, check.args);
		tools.push({
			id: check.id,
			installed: Boolean(version),
			version
		});
	}
	return {
		clients,
		tools
	};
});
//#endregion
export { detectHostTools_createServerFn_handler, dumpPostgres_createServerFn_handler, probePostgres_createServerFn_handler, restorePostgres_createServerFn_handler };
