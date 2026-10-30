import { o as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { a as object, i as number, n as boolean, o as string, t as _enum } from "../_libs/zod.mjs";
import { a as Server, c as HardDrive, i as ShieldCheck, l as Download, o as RotateCcw, r as Trash2, s as Plus, t as X, u as Database } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BRoyOrMR.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var PG_VERSIONS = [
	14,
	15,
	16,
	17,
	18
];
var defaultSchedule = () => ({
	enabled: false,
	every: "day",
	hour: 2,
	tool: "pgbackrest",
	kind: "full",
	keep: 7
});
var KEY = "kontur-vault-v1";
function row(n, cols) {
	return `(${cols.map((c, i) => {
		if (c === "id" || c.endsWith("_id")) return String((n * 17 + i * 3) % 9e3 + 1);
		if (c.includes("at") || c.includes("date")) return `'2026-10-${String(n % 27 + 1).padStart(2, "0")}T08:00:00Z'`;
		if (c.includes("amount") || c.includes("total") || c === "price") return (n * 13.4 % 900).toFixed(2);
		if (c === "status") return n % 4 === 0 ? "'void'" : "'posted'";
		if (c.includes("email")) return `'user${n}@example.test'`;
		return `'${c}-${n}'`;
	}).join(", ")})`;
}
function buildDump(server, database) {
	const db = server.databases.find((d) => d.name === database);
	if (!db) throw new Error("База не найдена в каталоге");
	const lines = [
		`-- Kontur logical dump`,
		`-- server: ${server.name} (${server.host}:${server.port})`,
		`-- postgresql: ${server.pgVersion}`,
		`-- database: ${db.name}`,
		`-- generated: ${(/* @__PURE__ */ new Date()).toISOString()}`,
		`-- mode: ${server.mode}`,
		`SET client_encoding = 'UTF8';`,
		`BEGIN;`,
		``
	];
	for (const table of db.tables) {
		const colDefs = table.cols.map((c) => {
			if (c === "id") return "id bigint PRIMARY KEY";
			if (c.includes("amount") || c.includes("total") || c === "price") return `${c} numeric(12,2)`;
			if (c.includes("at") || c.includes("date")) return `${c} timestamptz`;
			return `${c} text`;
		}).join(",\n  ");
		lines.push(`CREATE TABLE IF NOT EXISTS public.${quoteIdent(table.name)} (`);
		lines.push(`  ${colDefs}`);
		lines.push(`);`);
		const sample = Math.min(table.rows, 8);
		if (sample > 0) {
			const values = Array.from({ length: sample }, (_, i) => row(i + 1, table.cols));
			lines.push(`INSERT INTO public.${quoteIdent(table.name)} (${table.cols.map(quoteIdent).join(", ")}) VALUES`);
			lines.push(`${values.join(",\n")};`);
		}
		lines.push("");
	}
	lines.push("COMMIT;");
	lines.push("");
	return lines.join("\n");
}
function quoteIdent(name) {
	if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Недопустимое имя объекта");
	return `"${name}"`;
}
function seedState() {
	return {
		servers: [
			{
				id: "srv-billing",
				name: "billing-prod",
				host: "10.8.2.14",
				port: 5432,
				user: "backup_reader",
				password: "",
				ssl: true,
				region: "eu-central",
				pgVersion: 16,
				sshUser: "postgres",
				sshPort: 22,
				schedule: {
					...defaultSchedule(),
					tool: "pgbackrest",
					kind: "full",
					enabled: true
				},
				mode: "demo",
				databases: [{
					name: "payments",
					sizeMb: 1840,
					owner: "app",
					tables: [
						{
							name: "invoices",
							rows: 128440,
							cols: [
								"id",
								"customer_id",
								"amount",
								"status",
								"issued_at"
							]
						},
						{
							name: "refunds",
							rows: 2104,
							cols: [
								"id",
								"invoice_id",
								"amount",
								"created_at"
							]
						},
						{
							name: "ledger",
							rows: 640112,
							cols: [
								"id",
								"account",
								"amount",
								"posted_at"
							]
						}
					]
				}, {
					name: "customers",
					sizeMb: 420,
					owner: "app",
					tables: [{
						name: "accounts",
						rows: 48120,
						cols: [
							"id",
							"email",
							"plan",
							"created_at"
						]
					}, {
						name: "addresses",
						rows: 50211,
						cols: [
							"id",
							"account_id",
							"city",
							"country"
						]
					}]
				}]
			},
			{
				id: "srv-analytics",
				name: "analytics-replica",
				host: "10.8.4.7",
				port: 5432,
				user: "replica",
				password: "",
				ssl: true,
				region: "eu-north",
				pgVersion: 15,
				sshUser: "postgres",
				sshPort: 22,
				schedule: {
					...defaultSchedule(),
					tool: "barman",
					every: "week",
					hour: 3
				},
				mode: "demo",
				databases: [{
					name: "warehouse",
					sizeMb: 12600,
					owner: "etl",
					tables: [{
						name: "events",
						rows: 8400211,
						cols: [
							"id",
							"name",
							"user_id",
							"occurred_at"
						]
					}, {
						name: "sessions",
						rows: 990214,
						cols: [
							"id",
							"user_id",
							"started_at"
						]
					}]
				}]
			},
			{
				id: "srv-stage",
				name: "staging-app",
				host: "10.1.0.22",
				port: 5432,
				user: "staging",
				password: "",
				ssl: false,
				region: "local-dc",
				pgVersion: 17,
				sshUser: "postgres",
				sshPort: 22,
				schedule: {
					...defaultSchedule(),
					tool: "pg_probackup",
					kind: "incr",
					hour: 4
				},
				mode: "demo",
				databases: [{
					name: "app",
					sizeMb: 96,
					owner: "staging",
					tables: [{
						name: "users",
						rows: 240,
						cols: [
							"id",
							"email",
							"role",
							"created_at"
						]
					}, {
						name: "notes",
						rows: 88,
						cols: [
							"id",
							"user_id",
							"body",
							"updated_at"
						]
					}]
				}]
			}
		],
		jobs: [{
			id: "job-seed-1",
			serverId: "srv-billing",
			serverName: "billing-prod",
			database: "payments",
			createdAt: "2026-10-26T22:10:00.000Z",
			bytes: 48211,
			sql: "-- предыдущий ночной дамп сохранён на узле\n",
			tool: "pg_dump",
			backupKind: "full",
			status: "ok",
			kind: "backup",
			message: "Ночной логический дамп payments"
		}]
	};
}
function loadState() {
	if (typeof localStorage === "undefined") return seedState();
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return seedState();
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed.servers) || !Array.isArray(parsed.jobs)) return seedState();
		parsed.servers = parsed.servers.map((server) => ({
			...server,
			pgVersion: PG_VERSIONS.includes(server.pgVersion) ? server.pgVersion : 16,
			sshUser: server.sshUser || "postgres",
			sshPort: server.sshPort || 22,
			schedule: server.schedule ?? defaultSchedule()
		}));
		parsed.jobs = parsed.jobs.map((job) => ({
			...job,
			tool: job.tool === "wal-g" || !job.tool ? "pg_dump" : job.tool,
			kind: job.kind === "restore" ? "restore" : "backup",
			backupKind: job.backupKind ?? "full"
		}));
		return parsed;
	} catch {
		return seedState();
	}
}
function saveState(state) {
	localStorage.setItem(KEY, JSON.stringify(state));
}
function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1048576).toFixed(1)} MB`;
}
function formatMb(n) {
	if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
	return `${n} MB`;
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
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
var probePostgres = createServerFn({ method: "POST" }).validator(connSchema).handler(createSsrRpc("77cea8f8871a32830620ada5284809abb8f6d06a86642133428f0c21c4575375"));
var dumpSchema = connSchema.extend({ maxRows: number().int().min(1).max(200).default(40) });
var dumpPostgres = createServerFn({ method: "POST" }).validator(dumpSchema).handler(createSsrRpc("37ce827c1a1bc543a1b396d8fd93bac320c97e1c436046bb4690d65607b891b0"));
var restoreSchema = connSchema.extend({ sql: string().min(1).max(15e5) });
var restorePostgres = createServerFn({ method: "POST" }).validator(restoreSchema).handler(createSsrRpc("b5e66b277df4a328740ba1c66e5f5fd295bfd026ad5802204e3d1f2353b45764"));
createServerFn({ method: "GET" }).handler(createSsrRpc("af73ff3bbcae638eba2ad015abeebd3c82ba45a07d6985cb1996c5fbf249122b"));
var sshSchema = object({
	host: string().regex(/^[A-Za-z0-9._-]{1,253}$/),
	sshPort: number().int().min(1).max(65535),
	sshUser: string().regex(/^[a-z_][a-z0-9_-]{0,31}$/i)
});
var ident = string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/);
var inspectDbServer = createServerFn({ method: "POST" }).validator(sshSchema).handler(createSsrRpc("17079bfeef4d72b4dbd7500e8831f390427d23e11e08fae3ebc419f106677afb"));
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
var storeKonturBackup = createServerFn({ method: "POST" }).validator(storeSchema).handler(createSsrRpc("731ecb66f2457d728b22819c3164d7f701c064488939d0c5e6d5051a5e5d2775"));
var listKonturBackups = createServerFn({ method: "GET" }).handler(createSsrRpc("588b01f32a917835661b7bdd0f3342dc1ff06a1df4483faa164109ba13e15c84"));
var diskFree = createServerFn({ method: "GET" }).handler(createSsrRpc("63d64fa65d532eb8f1191f213d79776760c81dcf26b90bd06fa84e564c12776f"));
var rotateBackups = createServerFn({ method: "POST" }).validator(object({ keep: number().int().min(1).max(100) })).handler(createSsrRpc("17cc573b55325613c494f1c520eeeb50f87fd240526482abad6971811252b883"));
var readSchema = object({ path: string().min(1).max(300) });
var readKonturBackup = createServerFn({ method: "POST" }).validator(readSchema).handler(createSsrRpc("688b826871ac30804be0ad165b62a297c7da99b9e7f9fb69c155158ea7d40191"));
var TOOLS = [
	"pg_dump",
	"pgbackrest",
	"barman",
	"pg_probackup"
];
var TOOL_META = {
	pg_dump: {
		title: "pg_dump",
		blurb: "Логический дамп одной базы. Инкрементов нет — всегда полный."
	},
	pgbackrest: {
		title: "pgBackRest",
		blurb: "Полные и инкрементальные копии, stanza и PITR."
	},
	barman: {
		title: "Barman",
		blurb: "Полный бэкап или инкремент через reuse-backup."
	},
	pg_probackup: {
		title: "pg_probackup",
		blurb: "Полный или DELTA в собственном каталоге экземпляра."
	}
};
function clientBin(server, bin) {
	return `/usr/lib/postgresql/${server.pgVersion}/bin/${bin}`;
}
function stanza(server) {
	return server.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}
function shQuote(value) {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
function backupPlan(tool, server, database, kind) {
	const name = stanza(server);
	const host = `${server.host}:${server.port}`;
	const mode = kind === "incr" ? "incr" : "full";
	if (tool === "pg_dump") return [
		`#!/bin/sh`,
		`# pg_dump ${server.pgVersion} — ${server.name} / ${database}`,
		`# запрошен ${mode}; pg_dump всегда пишет полный дамп`,
		`export PGPASSWORD=${shQuote(server.password)}`,
		`${clientBin(server, "pg_dump")} --host=${shQuote(server.host)} --port=${server.port} --username=${shQuote(server.user)} \\`,
		`  --format=custom --file=${shQuote(`${database}.dump`)} ${shQuote(database)}`,
		`# хост ${host}`
	].join("\n");
	if (tool === "pgbackrest") return [
		`#!/bin/sh`,
		`# pgBackRest stanza ${name}, PostgreSQL ${server.pgVersion}, ${mode}`,
		`pgbackrest --stanza=${name} --type=${mode} backup`,
		`pgbackrest --stanza=${name} info`
	].join("\n");
	if (tool === "barman") return [
		`#!/bin/sh`,
		`# Barman server ${name}, PostgreSQL ${server.pgVersion}, ${mode}`,
		`barman check ${name}`,
		kind === "incr" ? `barman backup --reuse-backup=link ${name}` : `barman backup ${name}`,
		`barman list-backup ${name}`
	].join("\n");
	const pbMode = kind === "incr" ? "DELTA" : "FULL";
	return [
		`#!/bin/sh`,
		`# pg_probackup ${pbMode} — ${database} @ ${host}`,
		`pg_probackup backup -B /var/lib/pg_probackup --instance=${name} -b ${pbMode}`,
		`pg_probackup show -B /var/lib/pg_probackup --instance=${name}`
	].join("\n");
}
function restorePlan(tool, server, database, target) {
	const name = stanza(server);
	if (tool === "pg_dump") return [
		`#!/bin/sh`,
		`export PGPASSWORD=${shQuote(server.password)}`,
		`${clientBin(server, "pg_restore")} --host=${shQuote(server.host)} --port=${server.port} --username=${shQuote(server.user)} \\`,
		`  --clean --if-exists --dbname=${shQuote(target)} ${shQuote(`${database}.dump`)}`
	].join("\n");
	if (tool === "pgbackrest") return [
		`#!/bin/sh`,
		`pgbackrest --stanza=${name} --delta \\`,
		`  --type=time "--target=2026-10-27 02:00:00+00" \\`,
		`  --target-action=promote restore`
	].join("\n");
	if (tool === "barman") return [
		`#!/bin/sh`,
		`BACKUP=$(barman list-backup ${name} | awk 'NR==1 {print $2}')`,
		`barman recover ${name} "$BACKUP" /var/lib/postgresql/restore/${target}`
	].join("\n");
	return [
		`#!/bin/sh`,
		`pg_probackup restore -B /var/lib/pg_probackup --instance=${name} -D /var/lib/postgresql/restore/${target} -i latest`,
		`# режим каталога FULL`
	].join("\n");
}
function Home() {
	const [state, setState] = (0, import_react.useState)(null);
	const [selectedId, setSelectedId] = (0, import_react.useState)("srv-billing");
	const [adding, setAdding] = (0, import_react.useState)(false);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [notice, setNotice] = (0, import_react.useState)(null);
	const [restoreId, setRestoreId] = (0, import_react.useState)(null);
	const [targetDb, setTargetDb] = (0, import_react.useState)("");
	const [tool, setTool] = (0, import_react.useState)("pgbackrest");
	const [kind, setKind] = (0, import_react.useState)("full");
	const [keep, setKeep] = (0, import_react.useState)(7);
	const [disk, setDisk] = (0, import_react.useState)(null);
	const [remoteTools, setRemoteTools] = (0, import_react.useState)({});
	const [stored, setStored] = (0, import_react.useState)([]);
	async function refreshStored() {
		const listed = await listKonturBackups();
		if (listed.ok) setStored(listed.files);
	}
	(0, import_react.useEffect)(() => {
		const loaded = loadState();
		setState(loaded);
		setSelectedId(loaded.servers[0]?.id ?? "");
		refreshStored().catch(() => setStored([]));
		diskFree().then((info) => setDisk({
			total: info.total,
			free: info.free
		})).catch(() => setDisk(null));
	}, []);
	function commit(next) {
		setState(next);
		saveState(next);
	}
	const server = state?.servers.find((s) => s.id === selectedId) ?? null;
	const jobs = (0, import_react.useMemo)(() => {
		if (!state) return [];
		return [...state.jobs].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
	}, [state]);
	const totals = (0, import_react.useMemo)(() => {
		if (!state) return {
			servers: 0,
			backups: 0,
			bytes: 0
		};
		const backups = state.jobs.filter((j) => j.kind === "backup" && j.status === "ok");
		return {
			servers: state.servers.length,
			backups: backups.length,
			bytes: backups.reduce((sum, j) => sum + j.bytes, 0)
		};
	}, [state]);
	async function backup(dbName) {
		if (!state || !server) return;
		setBusy(dbName);
		setNotice(null);
		try {
			let sql;
			let message;
			if (tool === "pg_dump" && server.mode === "live") {
				const result = await dumpPostgres({ data: {
					host: server.host,
					port: server.port,
					user: server.user,
					password: server.password,
					database: dbName,
					ssl: server.ssl,
					maxRows: 40
				} });
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
			const storedFile = await storeKonturBackup({ data: {
				serverName: server.name,
				database: dbName,
				tool,
				kind: tool === "pg_dump" ? "full" : kind,
				body: sql
			} });
			const job = {
				id: crypto.randomUUID(),
				serverId: server.id,
				serverName: server.name,
				database: dbName,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				bytes: storedFile.bytes,
				sql: sql.slice(0, 4e3),
				tool,
				backupKind: tool === "pg_dump" ? "full" : kind,
				storedPath: storedFile.path,
				status: "ok",
				kind: "backup",
				message
			};
			commit({
				...state,
				jobs: [job, ...state.jobs].slice(0, 40)
			});
			await refreshStored();
			setNotice(`${TOOL_META[tool].title}: каталог на Hamster`);
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
				const result = await restorePostgres({ data: {
					host: server.host,
					port: server.port,
					user: server.user,
					password: server.password,
					database: targetDb,
					ssl: server.ssl,
					sql: job.sql
				} });
				if (!result.ok) throw new Error(result.error);
			} else await wait(600);
			const script = activeTool === "pg_dump" ? job.sql : restorePlan(activeTool, server, job.database, targetDb);
			const record = {
				id: crypto.randomUUID(),
				serverId: server.id,
				serverName: server.name,
				database: targetDb,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				bytes: new Blob([script]).size,
				sql: script,
				tool: activeTool,
				backupKind: job.backupKind ?? "full",
				status: "ok",
				kind: "restore",
				message: activeTool === "pg_dump" ? `Восстановлено pg_dump из ${job.database}` : `План ${TOOL_META[activeTool].title} для ${targetDb}`
			};
			commit({
				...state,
				jobs: [record, ...state.jobs].slice(0, 40)
			});
			setRestoreId(null);
			setNotice(`База ${targetDb} восстановлена`);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Ошибка восстановления");
		} finally {
			setBusy(null);
		}
	}
	async function testLive(profile) {
		setBusy("probe");
		setNotice(null);
		const db = profile.databases[0]?.name || "postgres";
		const result = await probePostgres({ data: {
			host: profile.host,
			port: profile.port,
			user: profile.user,
			password: profile.password,
			database: db,
			ssl: profile.ssl
		} });
		setBusy(null);
		if (!state || !result.ok) {
			if (!result.ok) setNotice(result.error);
			return;
		}
		const databases = result.databases.map((row) => ({
			name: row.datname,
			sizeMb: 0,
			owner: profile.user,
			tables: []
		}));
		const major = Math.floor(result.serverVersionNum / 1e4);
		const pgVersion = PG_VERSIONS.includes(major) ? major : profile.pgVersion;
		commit({
			...state,
			servers: state.servers.map((item) => item.id === profile.id ? {
				...item,
				databases,
				pgVersion
			} : item)
		});
		const sshUser = profile.sshUser || "postgres";
		const sshPort = profile.sshPort || 22;
		if (profile.mode !== "live") {
			setNotice(`PostgreSQL ${major}. Демо-узел: проверка средств по SSH пропускается.`);
			return;
		}
		const remote = await inspectDbServer({ data: {
			host: profile.host,
			sshPort,
			sshUser
		} });
		if (!remote.ok) {
			setNotice(`PostgreSQL ${major}. SSH ${sshUser}@${profile.host}: ${remote.error}`);
			return;
		}
		setRemoteTools((current) => ({
			...current,
			[profile.id]: remote.tools
		}));
		const ready = remote.tools.filter((item) => item.installed).map((item) => item.id);
		setNotice(ready.length ? `PostgreSQL ${major}. На сервере баз есть: ${ready.join(", ")}` : `PostgreSQL ${major}. На сервере баз ни одно средство не найдено`);
	}
	function removeServer(id) {
		if (!state) return;
		const servers = state.servers.filter((s) => s.id !== id);
		commit({
			...state,
			servers
		});
		setSelectedId(servers[0]?.id ?? "");
	}
	function removeJob(id) {
		if (!state) return;
		commit({
			...state,
			jobs: state.jobs.filter((j) => j.id !== id)
		});
	}
	async function download(job) {
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
	if (!state) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-screen bg-bg p-8 text-muted",
		children: "Загрузка контура…"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-screen bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "border-b border-border px-4 py-4 sm:px-8",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs tracking-widest text-primary uppercase",
							children: "админ hamster"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-2xl font-medium tracking-tight",
							children: "Hamster"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 max-w-xl text-sm text-muted",
							children: "Бэкапы PostgreSQL: pgBackRest, Barman, pg_probackup или pg_dump. Расписание, полный или инкрементный тип, отдельный каталог и ретенция."
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setAdding(true),
						className: "inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), "Свой узел"]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "border-b border-border px-4 py-3 sm:px-8",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted",
							children: "Каталоги бэкапов на Hamster"
						}),
						disk && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-fg",
							children: [
								"Свободно ",
								formatBytes(disk.free),
								" из ",
								formatBytes(disk.total),
								" (",
								Math.round(disk.free / Math.max(disk.total, 1) * 100),
								"%)"
							]
						}),
						stored.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Каталогов ещё нет. Каждый бэкап получает свой каталог."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-2 grid gap-1",
							children: stored.slice(0, 5).map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "font-mono text-xs text-muted",
								children: [
									file.path.split("/").slice(-2).join("/"),
									" · ",
									formatBytes(file.bytes)
								]
							}, file.path))
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-8 lg:grid-cols-[240px_1fr]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "grid grid-cols-3 gap-2 lg:col-span-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
								label: "Серверы",
								value: String(totals.servers)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
								label: "Дампы",
								value: String(totals.backups)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
								label: "Архив",
								value: formatBytes(totals.bytes)
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: "flex flex-col gap-2 lg:row-start-2",
						children: [
							state.servers.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setSelectedId(item.id),
								className: `rounded-xl border px-3 py-3 text-left ${item.id === selectedId ? "border-primary bg-surface-2" : "border-border bg-surface"}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 text-sm font-medium",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Server, { className: "size-4 text-primary" }), item.name]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 font-mono text-xs text-muted",
										children: [
											item.host,
											":",
											item.port
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 text-xs text-muted",
										children: [
											"PostgreSQL ",
											item.pgVersion ?? 16,
											" · ",
											item.region,
											" · ",
											item.mode === "demo" ? "демо" : "живой"
										]
									})
								]
							}, item.id)),
							state.servers.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "rounded-xl border border-border bg-surface p-4 text-sm text-muted",
								children: "Своих узлов пока нет."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setAdding(true),
								className: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), "Добавить узел"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "flex flex-col gap-4 lg:row-start-2",
						children: [
							notice && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg",
								children: notice
							}),
							server ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-lg font-medium",
										children: server.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 font-mono text-xs text-muted",
										children: [
											server.user,
											"@",
											server.host,
											":",
											server.port,
											" · PostgreSQL ",
											server.pgVersion ?? 16,
											server.ssl ? " · ssl" : " · без ssl"
										]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [server.mode === "live" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											disabled: busy === "probe",
											onClick: () => testLive(server),
											className: "inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "size-4" }), "Проверить"]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											onClick: () => removeServer(server.id),
											className: "inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-danger",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" }), "Убрать"]
										})]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border bg-surface p-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs text-muted",
											children: "Версия PostgreSQL"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2 flex flex-wrap gap-2",
											children: PG_VERSIONS.map((version) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													commit({
														...state,
														servers: state.servers.map((item) => item.id === server.id ? {
															...item,
															pgVersion: version
														} : item)
													});
												},
												className: `h-10 min-w-12 rounded-lg border px-3 font-mono text-sm ${(server.pgVersion ?? 16) === version ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"}`,
												children: version
											}, version))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-sm text-muted",
											children: [
												"Клиент на сервере баз ищется по SSH (",
												server.sshUser || "postgres",
												":",
												server.sshPort || 22,
												"). Каталог копии остаётся на Hamster."
											]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex flex-wrap gap-2",
									children: (remoteTools[server.id] ?? TOOLS.map((id) => ({
										id,
										installed: false,
										version: null
									}))).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: `rounded-lg border px-3 py-2 text-xs ${item.installed ? "border-primary text-fg" : "border-border text-muted"}`,
										children: [
											TOOL_META[item.id].title,
											": ",
											item.installed ? item.version : "на сервере баз не найдено"
										]
									}, item.id))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddDatabase, { onAdd: (name) => {
									if (server.databases.some((db) => db.name === name)) {
										setNotice(`База ${name} уже есть`);
										return;
									}
									commit({
										...state,
										servers: state.servers.map((item) => item.id === server.id ? {
											...item,
											databases: [...item.databases, {
												name,
												sizeMb: 0,
												owner: item.user,
												tables: []
											}]
										} : item)
									});
								} }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border bg-surface p-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs text-muted",
											children: "Средство"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2 flex flex-wrap gap-2",
											children: TOOLS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => setTool(item),
												className: `h-10 rounded-lg border px-3 text-sm ${tool === item ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"}`,
												children: TOOL_META[item].title
											}, item))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-2 text-sm text-muted",
											children: TOOL_META[tool].blurb
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-3 text-xs text-muted",
											children: "Тип"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2 flex gap-2",
											children: ["full", "incr"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => setKind(item),
												className: `h-10 rounded-lg border px-3 text-sm ${kind === item ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"}`,
												children: item === "full" ? "Полный" : "Инкрементный"
											}, item))
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
									className: "rounded-xl border border-border bg-surface p-4",
									onSubmit: (event) => {
										event.preventDefault();
										commit({
											...state,
											servers: state.servers.map((item) => item.id === server.id ? {
												...item,
												schedule: {
													...item.schedule,
													enabled: true,
													tool,
													kind: tool === "pg_dump" ? "full" : kind,
													keep
												}
											} : item)
										});
										setNotice(`Расписание: ${tool === "pg_dump" ? "полный pg_dump" : kind === "incr" ? "инкремент" : "полный"} ${TOOL_META[tool].title}, хранить ${keep}`);
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "text-xs text-muted",
											children: ["Расписание · ", server.schedule?.enabled ? "включено" : "выключено"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-2 flex flex-wrap items-end gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
													className: "text-xs text-muted",
													children: ["Когда", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
														value: server.schedule?.every ?? "day",
														onChange: (event) => {
															const every = event.target.value === "week" ? "week" : "day";
															commit({
																...state,
																servers: state.servers.map((item) => item.id === server.id ? {
																	...item,
																	schedule: {
																		...item.schedule,
																		every
																	}
																} : item)
															});
														},
														className: "mt-1 block h-10 rounded-lg border border-border bg-bg px-2 text-sm text-fg",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
															value: "day",
															children: "каждый день"
														}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
															value: "week",
															children: "раз в неделю"
														})]
													})]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
													className: "text-xs text-muted",
													children: ["Час", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
														type: "number",
														min: 0,
														max: 23,
														value: server.schedule?.hour ?? 2,
														onChange: (event) => {
															const hour = Math.min(23, Math.max(0, Number(event.target.value) || 0));
															commit({
																...state,
																servers: state.servers.map((item) => item.id === server.id ? {
																	...item,
																	schedule: {
																		...item.schedule,
																		hour
																	}
																} : item)
															});
														},
														className: "mt-1 block h-10 w-20 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
													})]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
													className: "text-xs text-muted",
													children: ["Хранить", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
														type: "number",
														min: 1,
														max: 100,
														value: keep,
														onChange: (event) => setKeep(Math.min(100, Math.max(1, Number(event.target.value) || 1))),
														className: "mt-1 block h-10 w-20 rounded-lg border border-border bg-bg px-2 text-sm text-fg"
													})]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "submit",
													className: "h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg",
													children: "Сохранить расписание"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "h-10 rounded-lg border border-border px-3 text-sm",
													onClick: () => {
														rotateBackups({ data: { keep } }).then(async (result) => {
															await refreshStored();
															const info = await diskFree();
															setDisk({
																total: info.total,
																free: info.free
															});
															setNotice(result.removed ? `Ретенция удалила каталогов: ${result.removed}` : "Старых каталогов нет");
														});
													},
													children: "Ротация"
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-xs text-muted",
											children: [
												"Сейчас: ",
												server.schedule?.every === "week" ? "еженедельно" : "ежедневно",
												" в ",
												server.schedule?.hour ?? 2,
												":00,",
												" ",
												server.schedule?.tool ? TOOL_META[server.schedule.tool].title : "средство не выбрано",
												", хранить",
												" ",
												server.schedule?.keep ?? keep,
												". Ротация удаляет каталоги старше лимита."
											]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid gap-3",
									children: server.databases.map((db) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
										className: "rounded-xl border border-border bg-surface p-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-center justify-between gap-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-2",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Database, { className: "size-4 text-primary" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
														className: "font-medium",
														children: db.name
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono text-xs text-muted",
														children: formatMb(db.sizeMb)
													})
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												disabled: busy === db.name,
												onClick: () => backup(db.name),
												className: "inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg disabled:opacity-60",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { className: "size-4" }), busy === db.name ? "Снимаю…" : `Бэкап · ${TOOL_META[tool].title}`]
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
											className: "mt-3 grid gap-1 sm:grid-cols-2",
											children: db.tables.map((table) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
												className: "font-mono text-xs text-muted",
												children: [
													table.name,
													" · ",
													table.rows.toLocaleString("ru-RU"),
													" строк"
												]
											}, table.name))
										})]
									}, db.name))
								})
							] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted",
								children: "Выберите сервер."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl border border-border bg-surface",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "border-b border-border px-4 py-3 text-sm font-medium",
									children: "Журнал"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
									className: "divide-y divide-border",
									children: [jobs.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
										className: "px-4 py-6 text-sm text-muted",
										children: "Операций ещё не было."
									}), jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-sm",
												children: [
													job.kind === "backup" ? "Бэкап" : "Восстановление",
													" · ",
													TOOL_META[job.tool ?? "pg_dump"].title,
													" ·",
													" ",
													job.database
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-xs text-muted",
												children: [
													job.serverName,
													" · ",
													new Date(job.createdAt).toLocaleString("ru-RU"),
													" · ",
													formatBytes(job.bytes)
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-xs text-muted",
												children: job.message
											})
										] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex gap-2",
											children: [job.kind === "backup" && job.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												onClick: () => download(job),
												className: "inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), (job.tool ?? "pg_dump") === "pg_dump" ? "SQL" : "Скрипт"]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												onClick: () => {
													setRestoreId(job.id);
													setTargetDb(server?.databases[0]?.name ?? job.database);
												},
												className: "inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" }), "Вернуть"]
											})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => removeJob(job.id),
												className: "inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted",
												"aria-label": "Удалить запись",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
											})]
										})]
									}, job.id))]
								})]
							})
						]
					})
				]
			}),
			adding && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddServer, {
				onClose: () => setAdding(false),
				onSave: (profile) => {
					commit({
						...state,
						servers: [...state.servers, profile]
					});
					setSelectedId(profile.id);
					setAdding(false);
				}
			}),
			restoreId && server && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dialog", {
				open: true,
				className: "fixed inset-0 z-20 m-0 flex h-full w-full items-end justify-center bg-black/50 p-4 sm:items-center",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "w-full max-w-md rounded-xl border border-border bg-surface p-4",
					onSubmit: (event) => {
						event.preventDefault();
						restore();
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-3 flex items-center justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-base font-medium",
								children: "Восстановление"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setRestoreId(null),
								"aria-label": "Закрыть",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-3 text-sm text-muted",
							children: (state.jobs.find((j) => j.id === restoreId)?.tool ?? "pg_dump") === "pg_dump" ? "Дамп pg_dump применится к выбранной базе. На живом узле SQL выполняется сразу, на демо фиксируется в журнале." : `Для ${TOOL_META[state.jobs.find((j) => j.id === restoreId)?.tool ?? "pg_dump"].title} в журнал запишется команда восстановления. Её запускают на хосте бэкапа, не из браузера.`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "mb-1 block text-xs text-muted",
							htmlFor: "target-db",
							children: "Целевая база"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							id: "target-db",
							value: targetDb,
							onChange: (event) => setTargetDb(event.target.value),
							className: "mb-4 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm",
							children: server.databases.map((db) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: db.name,
								children: db.name
							}, db.name))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: busy === "restore",
							className: "h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg disabled:opacity-60",
							children: busy === "restore" ? "Восстанавливаю…" : "Восстановить"
						})
					]
				})
			})
		]
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border bg-surface px-3 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 font-mono text-lg",
			children: value
		})]
	});
}
function AddServer({ onClose, onSave }) {
	const [name, setName] = (0, import_react.useState)("");
	const [host, setHost] = (0, import_react.useState)("");
	const [port, setPort] = (0, import_react.useState)("5432");
	const [user, setUser] = (0, import_react.useState)("postgres");
	const [password, setPassword] = (0, import_react.useState)("");
	const [databasesText, setDatabasesText] = (0, import_react.useState)("postgres");
	const [ssl, setSsl] = (0, import_react.useState)(true);
	const [pgVersion, setPgVersion] = (0, import_react.useState)(16);
	const [sshUser, setSshUser] = (0, import_react.useState)("postgres");
	const [sshPort, setSshPort] = (0, import_react.useState)("22");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dialog", {
		open: true,
		className: "fixed inset-0 z-20 m-0 flex h-full w-full items-end justify-center bg-black/50 p-4 sm:items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "w-full max-w-md rounded-xl border border-border bg-surface p-4",
			onSubmit: (event) => {
				event.preventDefault();
				const portNum = Number(port);
				if (!name.trim() || !host.trim() || !Number.isInteger(portNum)) return;
				const names = databasesText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
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
					sshUser: sshUser.trim() || "postgres",
					sshPort: Number(sshPort) || 22,
					schedule: {
						enabled: false,
						every: "day",
						hour: 2,
						tool: "pgbackrest",
						kind: "full",
						keep: 7
					},
					mode: "live",
					databases: unique.map((dbName) => ({
						name: dbName,
						sizeMb: 0,
						owner: user.trim() || "postgres",
						tables: []
					}))
				});
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-base font-medium",
						children: "Свой узел"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Закрыть",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-3 text-xs text-muted",
					children: "Пароль базы остаётся в браузере. Проверка средств идёт по SSH на сервер баз. Каталог бэкапа создаётся на Hamster."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Имя узла",
							value: name,
							onChange: setName
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Хост",
							value: host,
							onChange: setHost
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Порт PostgreSQL",
								value: port,
								onChange: setPort
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Пользователь базы",
								value: user,
								onChange: setUser
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "SSH-пользователь",
								value: sshUser,
								onChange: setSshUser
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "SSH-порт",
								value: sshPort,
								onChange: setSshPort
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Базы через запятую",
							value: databasesText,
							onChange: setDatabasesText
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Пароль",
							value: password,
							onChange: setPassword,
							secret: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex h-11 items-center gap-2 text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: ssl,
								onChange: (event) => setSsl(event.target.checked)
							}), "Требовать SSL"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted",
							children: "Версия"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-1 flex flex-wrap gap-2",
							children: PG_VERSIONS.map((version) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setPgVersion(version),
								className: `h-10 min-w-12 rounded-lg border px-3 font-mono text-sm ${pgVersion === version ? "border-primary bg-bg text-fg" : "border-border text-muted"}`,
								children: version
							}, version))
						})] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "submit",
					className: "mt-3 h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-fg",
					children: "Добавить узел"
				})
			]
		})
	});
}
function AddDatabase({ onAdd }) {
	const [name, setName] = (0, import_react.useState)("");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		className: "flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4",
		onSubmit: (event) => {
			event.preventDefault();
			const next = name.trim();
			if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(next)) return;
			onAdd(next);
			setName("");
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "min-w-40 flex-1 text-xs text-muted",
			children: ["База на этом узле", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: name,
				onChange: (event) => setName(event.target.value),
				placeholder: "app_db",
				className: "mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "submit",
			className: "h-11 rounded-lg border border-border px-3 text-sm",
			children: "Добавить базу"
		})]
	});
}
function Field({ label, value, onChange, secret }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block text-xs text-muted",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			required: label !== "Пароль",
			type: secret ? "password" : "text",
			value,
			onChange: (event) => onChange(event.target.value),
			className: "mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"
		})]
	});
}
function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
//#endregion
export { Home as component };
