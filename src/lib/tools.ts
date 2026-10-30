import type { ServerProfile } from "@/lib/vault";

export const TOOLS = ["pg_dump", "pgbackrest", "barman", "pg_probackup"] as const;
export type BackupTool = (typeof TOOLS)[number];
export type BackupKind = "full" | "incr";

export const TOOL_META: Record<BackupTool, { title: string; blurb: string }> = {
  pg_dump: {
    title: "pg_dump",
    blurb: "Логический дамп одной базы. Инкрементов нет — всегда полный.",
  },
  pgbackrest: {
    title: "pgBackRest",
    blurb: "Полные и инкрементальные копии, stanza и PITR.",
  },
  barman: {
    title: "Barman",
    blurb: "Полный бэкап или инкремент через reuse-backup.",
  },
  pg_probackup: {
    title: "pg_probackup",
    blurb: "Полный или DELTA в собственном каталоге экземпляра.",
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

export function backupPlan(
  tool: BackupTool,
  server: ServerProfile,
  database: string,
  kind: BackupKind,
): string {
  const name = stanza(server);
  const host = `${server.host}:${server.port}`;
  const mode = kind === "incr" ? "incr" : "full";
  if (tool === "pg_dump") {
    return [
      `#!/bin/sh`,
      `# pg_dump ${server.pgVersion} — ${server.name} / ${database}`,
      `# запрошен ${mode}; pg_dump всегда пишет полный дамп`,
      `export PGPASSWORD=${shQuote(server.password)}`,
      `${clientBin(server, "pg_dump")} --host=${shQuote(server.host)} --port=${server.port} --username=${shQuote(server.user)} \\`,
      `  --format=custom --file=${shQuote(`${database}.dump`)} ${shQuote(database)}`,
      `# хост ${host}`,
    ].join("\n");
  }
  if (tool === "pgbackrest") {
    return [
      `#!/bin/sh`,
      `# pgBackRest stanza ${name}, PostgreSQL ${server.pgVersion}, ${mode}`,
      `pgbackrest --stanza=${name} --type=${mode} backup`,
      `pgbackrest --stanza=${name} info`,
    ].join("\n");
  }
  if (tool === "barman") {
    return [
      `#!/bin/sh`,
      `# Barman server ${name}, PostgreSQL ${server.pgVersion}, ${mode}`,
      `barman check ${name}`,
      kind === "incr" ? `barman backup --reuse-backup=link ${name}` : `barman backup ${name}`,
      `barman list-backup ${name}`,
    ].join("\n");
  }
  const pbMode = kind === "incr" ? "DELTA" : "FULL";
  return [
    `#!/bin/sh`,
    `# pg_probackup ${pbMode} — ${database} @ ${host}`,
    `pg_probackup backup -B /var/lib/pg_probackup --instance=${name} -b ${pbMode}`,
    `pg_probackup show -B /var/lib/pg_probackup --instance=${name}`,
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
  const pbMode = "FULL";
  return [
    `#!/bin/sh`,
    `pg_probackup restore -B /var/lib/pg_probackup --instance=${name} -D /var/lib/postgresql/restore/${target} -i latest`,
    `# режим каталога ${pbMode}`,
  ].join("\n");
}

export function isTool(value: string): value is BackupTool {
  return (TOOLS as readonly string[]).includes(value);
}
