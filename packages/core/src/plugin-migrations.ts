import { sha256 } from "@noble/hashes/sha256.js";
import { encodeHex } from "./encoding.js";
import type { DatabaseDialect } from "./core-migrations.js";
import type { OwnAuthPluginDefinition } from "./plugin-types.js";

export interface PluginMigrationDatabase {
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<{ rows: Row[] }>;
  transaction?<Result>(
    work: (database: PluginMigrationDatabase) => Promise<Result>
  ): Promise<Result>;
}

export interface ResolvedPluginMigration {
  id: string;
  pluginId: string;
  pluginVersion: string;
  checksum: string;
  sql: string;
}

export interface PluginMigrationStatus {
  missing: ResolvedPluginMigration[];
  checksumMismatches: Array<{
    migration: ResolvedPluginMigration;
    appliedChecksum: string;
  }>;
}

export function resolvePluginMigrations(
  plugins: readonly OwnAuthPluginDefinition[],
  dialect: DatabaseDialect = "postgres"
): ResolvedPluginMigration[] {
  return [...plugins]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((plugin) => (plugin.migrations ?? []).map((migration) => {
      const sql = migration.sql[dialect]?.trim();
      if (!sql) {
        throw new Error(
          `Plugin ${plugin.id} does not provide a ${dialect === "d1" ? "D1" : "Postgres"} ` +
          `migration for ${plugin.id}:${migration.id}`
        );
      }
      return {
        id: `${plugin.id}:${migration.id}`,
        pluginId: plugin.id,
        pluginVersion: plugin.version,
        checksum: checksum(sql),
        sql
      };
    }));
}

export async function applyPluginMigrations(
  database: PluginMigrationDatabase,
  migrations: readonly ResolvedPluginMigration[]
): Promise<number> {
  const status = await inspectPluginMigrations(database, migrations);
  if (status.checksumMismatches.length > 0) {
    throw new Error(formatChecksumMismatch(status.checksumMismatches[0]!));
  }
  if (status.missing.length > 0 && !database.transaction) {
    throw new Error("Plugin migrations require a database transaction implementation");
  }
  for (const migration of status.missing) {
    await database.transaction!((transaction) => applyMigration(transaction, migration));
  }
  return status.missing.length;
}

async function applyMigration(
  database: PluginMigrationDatabase,
  migration: ResolvedPluginMigration
): Promise<void> {
  await database.query(migration.sql);
  await database.query(
    `insert into own_auth_plugin_migrations
      (id, plugin_id, plugin_version, checksum)
     values ($1, $2, $3, $4)`,
    [migration.id, migration.pluginId, migration.pluginVersion, migration.checksum]
  );
}

export async function inspectPluginMigrations(
  database: PluginMigrationDatabase,
  migrations: readonly ResolvedPluginMigration[]
): Promise<PluginMigrationStatus> {
  if (migrations.length === 0) return { missing: [], checksumMismatches: [] };
  const result = await database.query<{ id: string; checksum: string }>(
    "select id, checksum from own_auth_plugin_migrations"
  );
  const applied = new Map(result.rows.map((row) => [row.id, row.checksum]));
  const missing: ResolvedPluginMigration[] = [];
  const checksumMismatches: PluginMigrationStatus["checksumMismatches"] = [];
  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.id);
    if (!appliedChecksum) missing.push(migration);
    else if (appliedChecksum !== migration.checksum) {
      checksumMismatches.push({ migration, appliedChecksum });
    }
  }
  return { missing, checksumMismatches };
}

export function formatChecksumMismatch(
  mismatch: PluginMigrationStatus["checksumMismatches"][number]
): string {
  return `Plugin migration checksum mismatch: ${mismatch.migration.id}`;
}

function checksum(sql: string): string {
  return encodeHex(sha256(new TextEncoder().encode(sql)));
}
