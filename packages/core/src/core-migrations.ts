import { readFile } from "node:fs/promises";
import { coreMigrationFiles } from "./database-metadata.js";

export { coreMigrationFiles };

export const coreMigrationVersions = coreMigrationFiles.map((file) => file.replace(/\.sql$/, ""));

export type DatabaseDialect = "postgres" | "d1";

export interface CoreMigration {
  file: (typeof coreMigrationFiles)[number];
  sql: string;
}

export async function readCoreMigration(
  file: (typeof coreMigrationFiles)[number],
  dialect: DatabaseDialect = "postgres"
): Promise<string> {
  const directory = dialect === "d1" ? "d1/" : "";
  return readFile(new URL(`../migrations/${directory}${file}`, import.meta.url), "utf8");
}

export async function readCoreMigrations(
  dialect: DatabaseDialect = "postgres"
): Promise<CoreMigration[]> {
  return Promise.all(coreMigrationFiles.map(async (file) => ({
    file,
    sql: await readCoreMigration(file, dialect)
  })));
}

export async function readCoreMigrationSql(
  dialect: DatabaseDialect = "postgres"
): Promise<string> {
  const migrations = await readCoreMigrations(dialect);
  return `${migrations.map(({ sql }) => sql.trim()).join("\n\n")}\n`;
}
