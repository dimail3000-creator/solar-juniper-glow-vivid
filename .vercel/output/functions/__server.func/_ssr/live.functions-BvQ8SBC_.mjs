import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as object, i as number, n as boolean, o as string, t as _enum } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/live.functions-BvQ8SBC_.js
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
			id: "pg_probackup",
			bin: "pg_probackup",
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
var sshSchema = object({
	host: string().regex(/^[A-Za-z0-9._-]{1,253}$/),
	sshPort: number().int().min(1).max(65535),
	sshUser: string().regex(/^[a-z_][a-z0-9_-]{0,31}$/i)
});
var ident = string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/);
function sshArgs(data, remote) {
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
		...remote
	];
}
async function runSsh(data, remote, maxBuffer = 1e6) {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	return promisify(execFile)("ssh", sshArgs(data, remote), {
		timeout: 2e4,
		maxBuffer
	});
}
var inspectDbServer_createServerFn_handler = createServerRpc({
	id: "17079bfeef4d72b4dbd7500e8831f390427d23e11e08fae3ebc419f106677afb",
	name: "inspectDbServer",
	filename: "src/lib/live.functions.ts"
}, (opts) => inspectDbServer.__executeServer(opts));
var inspectDbServer = createServerFn({ method: "POST" }).validator(sshSchema).handler(inspectDbServer_createServerFn_handler, async ({ data }) => {
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
		"done"
	].join("\n");
	try {
		const { stdout } = await runSsh(data, [
			"sh",
			"-c",
			script
		]);
		return {
			ok: true,
			tools: String(stdout).split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
				const [id, ...rest] = line.split("	");
				const version = rest.join("	").trim();
				return {
					id,
					installed: version !== "missing" && version.length > 0,
					version: version === "missing" ? null : version.slice(0, 180)
				};
			})
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "SSH к серверу баз не удался"
		};
	}
});
var storeSchema = object({
	serverName: string().trim().min(1).max(80),
	database: ident,
	tool: _enum([
		"pg_dump",
		"pgbackrest",
		"barman",
		"pg_probackup"
	]),
	kind: _enum(["full", "incr"]),
	body: string().max(4e6)
});
function backupRoot() {
	return `${process.cwd()}/data/backups`;
}
function safeSegment(value) {
	return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}
var storeKonturBackup_createServerFn_handler = createServerRpc({
	id: "731ecb66f2457d728b22819c3164d7f701c064488939d0c5e6d5051a5e5d2775",
	name: "storeKonturBackup",
	filename: "src/lib/live.functions.ts"
}, (opts) => storeKonturBackup.__executeServer(opts));
var storeKonturBackup = createServerFn({ method: "POST" }).validator(storeSchema).handler(storeKonturBackup_createServerFn_handler, async ({ data }) => {
	const { mkdir, writeFile } = await import("node:fs/promises");
	const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
	const dir = `${backupRoot()}/${safeSegment(data.serverName)}/${stamp}-${safeSegment(data.database)}-${data.kind}`;
	await mkdir(dir, { recursive: true });
	const file = `${dir}/backup.${data.tool === "pg_dump" ? "sql" : "log"}`;
	const meta = [
		`tool=${data.tool}`,
		`kind=${data.kind}`,
		`database=${data.database}`,
		`server=${data.serverName}`,
		`created=${(/* @__PURE__ */ new Date()).toISOString()}`,
		""
	].join("\n");
	await writeFile(`${dir}/meta.txt`, meta, "utf8");
	await writeFile(file, data.body, "utf8");
	return {
		ok: true,
		path: dir,
		bytes: Buffer.byteLength(data.body) + Buffer.byteLength(meta)
	};
});
var listKonturBackups_createServerFn_handler = createServerRpc({
	id: "588b01f32a917835661b7bdd0f3342dc1ff06a1df4483faa164109ba13e15c84",
	name: "listKonturBackups",
	filename: "src/lib/live.functions.ts"
}, (opts) => listKonturBackups.__executeServer(opts));
var listKonturBackups = createServerFn({ method: "GET" }).handler(listKonturBackups_createServerFn_handler, async () => {
	const { readdir, stat } = await import("node:fs/promises");
	const root = backupRoot();
	try {
		const servers = await readdir(root);
		const files = [];
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
				files.push({
					path,
					bytes,
					mtime: info.mtime.toISOString()
				});
			}
		}
		files.sort((a, b) => a.mtime < b.mtime ? 1 : -1);
		return {
			ok: true,
			files: files.slice(0, 40)
		};
	} catch {
		return {
			ok: true,
			files: []
		};
	}
});
var diskFree_createServerFn_handler = createServerRpc({
	id: "63d64fa65d532eb8f1191f213d79776760c81dcf26b90bd06fa84e564c12776f",
	name: "diskFree",
	filename: "src/lib/live.functions.ts"
}, (opts) => diskFree.__executeServer(opts));
var diskFree = createServerFn({ method: "GET" }).handler(diskFree_createServerFn_handler, async () => {
	const { statfs } = await import("node:fs/promises");
	const { mkdir } = await import("node:fs/promises");
	const root = backupRoot();
	await mkdir(root, { recursive: true });
	const stats = await statfs(root);
	const block = Number(stats.bsize);
	return {
		path: root,
		total: block * Number(stats.blocks),
		free: block * Number(stats.bavail)
	};
});
var rotateBackups_createServerFn_handler = createServerRpc({
	id: "17cc573b55325613c494f1c520eeeb50f87fd240526482abad6971811252b883",
	name: "rotateBackups",
	filename: "src/lib/live.functions.ts"
}, (opts) => rotateBackups.__executeServer(opts));
var rotateBackups = createServerFn({ method: "POST" }).validator(object({ keep: number().int().min(1).max(100) })).handler(rotateBackups_createServerFn_handler, async ({ data }) => {
	const { readdir, stat, rm } = await import("node:fs/promises");
	const root = backupRoot();
	const dirs = [];
	try {
		for (const server of await readdir(root)) {
			const serverDir = `${root}/${server}`;
			for (const name of await readdir(serverDir)) {
				const path = `${serverDir}/${name}`;
				const info = await stat(path);
				if (info.isDirectory()) dirs.push({
					path,
					mtime: info.mtimeMs
				});
			}
		}
	} catch {
		return {
			ok: true,
			removed: 0
		};
	}
	dirs.sort((a, b) => b.mtime - a.mtime);
	const stale = dirs.slice(data.keep);
	for (const dir of stale) await rm(dir.path, {
		recursive: true,
		force: true
	});
	return {
		ok: true,
		removed: stale.length
	};
});
var readSchema = object({ path: string().min(1).max(300) });
var readKonturBackup_createServerFn_handler = createServerRpc({
	id: "688b826871ac30804be0ad165b62a297c7da99b9e7f9fb69c155158ea7d40191",
	name: "readKonturBackup",
	filename: "src/lib/live.functions.ts"
}, (opts) => readKonturBackup.__executeServer(opts));
var readKonturBackup = createServerFn({ method: "POST" }).validator(readSchema).handler(readKonturBackup_createServerFn_handler, async ({ data }) => {
	const root = backupRoot();
	if (!data.path.startsWith(`${root}/`) || data.path.includes("..")) return {
		ok: false,
		error: "Путь вне хранилища Контура"
	};
	const { readFile, readdir } = await import("node:fs/promises");
	let file = data.path;
	try {
		const payload = (await readdir(data.path)).find((name) => name.startsWith("backup."));
		if (payload) file = `${data.path}/${payload}`;
	} catch {
		file = data.path;
	}
	return {
		ok: true,
		body: await readFile(file, "utf8")
	};
});
//#endregion
export { detectHostTools_createServerFn_handler, diskFree_createServerFn_handler, dumpPostgres_createServerFn_handler, inspectDbServer_createServerFn_handler, listKonturBackups_createServerFn_handler, probePostgres_createServerFn_handler, readKonturBackup_createServerFn_handler, restorePostgres_createServerFn_handler, rotateBackups_createServerFn_handler, storeKonturBackup_createServerFn_handler };
