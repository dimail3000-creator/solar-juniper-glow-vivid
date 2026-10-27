import type { ServerProfile } from "@/lib/vault";

export const TOOLS = ["pg_dump", "pgbackrest", "barman", "wal-g"] as const;
export type BackupTool = (typeof TOOLS)[number];

export const TOOL_META: Record<BackupTool, { title: string; blurb: string }> = {
  pg_dump: {
    title: "pg_dump",
    blurb: "Логический дамп одной базы. Восстановление через psql.",
  },
  pgbackrest: {
    title: "pgBackRest",
    blurb: "Полные и инкрементальные копии со stanza и PITR.",
  },
  barman: {
    title: "Barman",
    blurb: "Централизованный бэкап и recover на указанный момент.",
  },
  "wal-g": {
    title: "wal-g",
    blurb: "Непрерывная архивация WAL и backup-push в объектное хранилище.",
  },
};

function clientBin(server: ServerProfile, bin: "pg_dump" | "pg_restore"): string {
  return `/usr/lib/postgresql/${server.pgVersion}/bin/${bin}`;
}

function stanza(server: ServerProfile): string {
  return server.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function backupPlan(tool: BackupTool, server: ServerProfile, database: string): string {
  const name = stanza(server);
  const host = `${server.host}:${server.port}`;
  if (tool === "pg_dump") {
    return [
      `#!/bin/sh`,
      `# pg_dump ${server.pgVersion} — ${server.name} / ${database}`,
      `export PGPASSWORD=${shQuote(server.password)}`,
      `${clientBin(server, "pg_dump")} --host=${shQuote(server.host)} --port=${server.port} --username=${shQuote(server.user)} \\`,
      `  --format=custom --file=${shQuote(`${database}.dump`)} ${shQuote(database)}`,
      `# хост ${host}`,
    ].join("\n");
  }
  if (tool === "pgbackrest") {
    return [
      `#!/bin/sh`,
      `# pgBackRest stanza ${name}, PostgreSQL ${server.pgVersion}`,
      `pgbackrest --stanza=${name} --type=full backup`,
      `pgbackrest --stanza=${name} info`,
    ].join("\n");
  }
  if (tool === "barman") {
    return [
      `#!/bin/sh`,
      `# Barman server ${name}, PostgreSQL ${server.pgVersion}`,
      `barman check ${name}`,
      `barman backup ${name}`,
      `barman list-backup ${name}`,
    ].join("\n");
  }
  return [
    `#!/bin/sh`,
    `# wal-g backup-push — PostgreSQL ${server.pgVersion}, ${database} @ ${host}`,
    `wal-g backup-push ${shQuote(`/var/lib/postgresql/${server.pgVersion}/main`)}`,
    `wal-g backup-list`,
  ].join("\n");
}

export function restorePlan(
  tool: BackupTool,
  server: ServerProfile,
  database: string,
  target: string,
): string {
  const name = stanza(server);
  if (tool === "pg_dump") {
    return [
      `#!/bin/sh`,
      `export PGPASSWORD=${shQuote(server.password)}`,
      `${clientBin(server, "pg_restore")} --host=${shQuote(server.host)} --port=${server.port} --username=${shQuote(server.user)} \\`,
      `  --clean --if-exists --dbname=${shQuote(target)} ${shQuote(`${database}.dump`)}`,
    ].join("\n");
  }
  if (tool === "pgbackrest") {
    return [
      `#!/bin/sh`,
      `pgbackrest --stanza=${name} --delta \\`,
      `  --type=time "--target=2026-10-27 02:00:00+00" \\`,
      `  --target-action=promote restore`,
    ].join("\n");
  }
  if (tool === "barman") {
    return [
      `#!/bin/sh`,
      `BACKUP=$(barman list-backup ${name} | awk 'NR==1 {print $2}')`,
      `barman recover ${name} "$BACKUP" /var/lib/postgresql/restore/${target}`,
    ].join("\n");
  }
  return [
    `#!/bin/sh`,
    `BACKUP=$(wal-g backup-list | awk 'NR==2 {print $1}')`,
    `wal-g backup-fetch /var/lib/postgresql/restore/${target} "$BACKUP"`,
  ].join("\n");
}

export function isTool(value: string): value is BackupTool {
  return (TOOLS as readonly string[]).includes(value);
}
