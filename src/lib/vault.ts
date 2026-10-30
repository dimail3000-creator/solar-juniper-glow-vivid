import type { BackupKind, BackupTool } from "@/lib/tools";

export type TableInfo = { name: string; rows: number; cols: string[] };

export type DatabaseInfo = {
  name: string;
  sizeMb: number;
  owner: string;
  tables: TableInfo[];
};

export const PG_VERSIONS = [14, 15, 16, 17, 18] as const;
export type PgVersion = (typeof PG_VERSIONS)[number];

export type Schedule = {
  enabled: boolean;
  every: "day" | "week";
  hour: number;
  tool: BackupTool;
  kind: BackupKind;
  keep: number;
  lastRun?: string;
};

const defaultSchedule = (): Schedule => ({
  enabled: false,
  every: "day",
  hour: 2,
  tool: "pgbackrest",
  kind: "full",
  keep: 7,
});

export type ServerProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ssl: boolean;
  region: string;
  pgVersion: PgVersion;
  sshUser: string;
  sshPort: number;
  schedule: Schedule;
  mode: "demo" | "live";
  databases: DatabaseInfo[];
};

export type BackupJob = {
  id: string;
  serverId: string;
  serverName: string;
  database: string;
  createdAt: string;
  bytes: number;
  sql: string;
  tool: BackupTool;
  backupKind: BackupKind;
  storedPath?: string;
  status: "ok" | "failed";
  kind: "backup" | "restore";
  message: string;
};

export type VaultState = {
  servers: ServerProfile[];
  jobs: BackupJob[];
};

const KEY = "kontur-vault-v1";

function row(n: number, cols: string[]): string {
  const cells = cols.map((c, i) => {
    if (c === "id" || c.endsWith("_id")) return String((n * 17 + i * 3) % 9000 + 1);
    if (c.includes("at") || c.includes("date")) return `'2026-10-${String((n % 27) + 1).padStart(2, "0")}T08:00:00Z'`;
    if (c.includes("amount") || c.includes("total") || c === "price") return ((n * 13.4) % 900).toFixed(2);
    if (c === "status") return n % 4 === 0 ? "'void'" : "'posted'";
    if (c.includes("email")) return `'user${n}@example.test'`;
    return `'${c}-${n}'`;
  });
  return `(${cells.join(", ")})`;
}

export function buildDump(server: ServerProfile, database: string): string {
  const db = server.databases.find((d) => d.name === database);
  if (!db) throw new Error("База не найдена в каталоге");
  const lines: string[] = [
    `-- Kontur logical dump`,
    `-- server: ${server.name} (${server.host}:${server.port})`,
    `-- postgresql: ${server.pgVersion}`,
    `-- database: ${db.name}`,
    `-- generated: ${new Date().toISOString()}`,
    `-- mode: ${server.mode}`,
    `SET client_encoding = 'UTF8';`,
    `BEGIN;`,
    ``,
  ];
  for (const table of db.tables) {
    const colDefs = table.cols
      .map((c) => {
        if (c === "id") return "id bigint PRIMARY KEY";
        if (c.includes("amount") || c.includes("total") || c === "price") return `${c} numeric(12,2)`;
        if (c.includes("at") || c.includes("date")) return `${c} timestamptz`;
        return `${c} text`;
      })
      .join(",\n  ");
    lines.push(`CREATE TABLE IF NOT EXISTS public.${quoteIdent(table.name)} (`);
    lines.push(`  ${colDefs}`);
    lines.push(`);`);
    const sample = Math.min(table.rows, 8);
    if (sample > 0) {
      const values = Array.from({ length: sample }, (_, i) => row(i + 1, table.cols));
      lines.push(
        `INSERT INTO public.${quoteIdent(table.name)} (${table.cols.map(quoteIdent).join(", ")}) VALUES`,
      );
      lines.push(`${values.join(",\n")};`);
    }
    lines.push("");
  }
  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error("Недопустимое имя объекта");
  }
  return `"${name}"`;
}

export function seedState(): VaultState {
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
        schedule: { ...defaultSchedule(), tool: "pgbackrest", kind: "full", enabled: true },
        mode: "demo",
        databases: [
          {
            name: "payments",
            sizeMb: 1840,
            owner: "app",
            tables: [
              { name: "invoices", rows: 128440, cols: ["id", "customer_id", "amount", "status", "issued_at"] },
              { name: "refunds", rows: 2104, cols: ["id", "invoice_id", "amount", "created_at"] },
              { name: "ledger", rows: 640112, cols: ["id", "account", "amount", "posted_at"] },
            ],
          },
          {
            name: "customers",
            sizeMb: 420,
            owner: "app",
            tables: [
              { name: "accounts", rows: 48120, cols: ["id", "email", "plan", "created_at"] },
              { name: "addresses", rows: 50211, cols: ["id", "account_id", "city", "country"] },
            ],
          },
        ],
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
        schedule: { ...defaultSchedule(), tool: "barman", every: "week", hour: 3 },
        mode: "demo",
        databases: [
          {
            name: "warehouse",
            sizeMb: 12600,
            owner: "etl",
            tables: [
              { name: "events", rows: 8400211, cols: ["id", "name", "user_id", "occurred_at"] },
              { name: "sessions", rows: 990214, cols: ["id", "user_id", "started_at"] },
            ],
          },
        ],
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
        schedule: { ...defaultSchedule(), tool: "pg_probackup", kind: "incr", hour: 4 },
        mode: "demo",
        databases: [
          {
            name: "app",
            sizeMb: 96,
            owner: "staging",
            tables: [
              { name: "users", rows: 240, cols: ["id", "email", "role", "created_at"] },
              { name: "notes", rows: 88, cols: ["id", "user_id", "body", "updated_at"] },
            ],
          },
        ],
      },
    ],
    jobs: [
      {
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
        message: "Ночной логический дамп payments",
      },
    ],
  };
}

export function loadState(): VaultState {
  if (typeof localStorage === "undefined") return seedState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as VaultState;
    if (!Array.isArray(parsed.servers) || !Array.isArray(parsed.jobs)) return seedState();
    parsed.servers = parsed.servers.map((server) => ({
      ...server,
      pgVersion: PG_VERSIONS.includes(server.pgVersion) ? server.pgVersion : 16,
      sshUser: server.sshUser || "postgres",
      sshPort: server.sshPort || 22,
      schedule: server.schedule ?? defaultSchedule(),
    }));
    parsed.jobs = parsed.jobs.map((job) => ({
      ...job,
      tool: job.tool === ("wal-g" as BackupTool) || !job.tool ? "pg_dump" : job.tool,
      kind: job.kind === "restore" ? "restore" : "backup",
      backupKind: job.backupKind ?? "full",
    }));
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state: VaultState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMb(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${n} MB`;
}
