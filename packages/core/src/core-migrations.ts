import { readFile } from "node:fs/promises";

export const coreMigrationFiles = [
  "001_initial.sql",
  "002_external_providers.sql",
  "003_oauth_transactions.sql",
  "004_mfa.sql",
  "005_oauth_credentials.sql",
  "006_passkeys.sql",
  "007_plugin_migrations.sql"
] as const;

export const coreMigrationVersions = coreMigrationFiles.map((file) => file.replace(/\.sql$/, ""));

export async function readCoreMigration(file: (typeof coreMigrationFiles)[number]): Promise<string> {
  return readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
}

export async function readCoreMigrationSql(): Promise<string> {
  const migrations = await Promise.all(coreMigrationFiles.map(readCoreMigration));
  return `${migrations.map((sql) => sql.trim()).join("\n\n")}\n`;
}
