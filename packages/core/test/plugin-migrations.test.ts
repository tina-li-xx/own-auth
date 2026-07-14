import { describe, expect, it } from "vitest";
import {
  applyPluginMigrations,
  inspectPluginMigrations,
  resolvePluginMigrations,
  type PluginMigrationDatabase
} from "../src/plugin-migrations.js";
import { defineOwnAuthPlugin } from "../src/index.js";

describe("plugin migrations", () => {
  it("runs every pending migration in its own transaction", async () => {
    const database = new MigrationDatabase();
    const migrations = resolvePluginMigrations([pluginWithSql(
      "create table if not exists plugin_example_records (id text primary key)"
    )]);

    await expect(applyPluginMigrations(database, migrations)).resolves.toBe(1);
    expect(database.transactionCount).toBe(1);
    expect(database.applied.get("example:001_initial")).toBe(migrations[0]?.checksum);
  });

  it("stops before running SQL when an applied checksum changed", async () => {
    const database = new MigrationDatabase();
    database.applied.set("example:001_initial", "old-checksum");
    const migrations = resolvePluginMigrations([pluginWithSql("select 1")]);

    await expect(applyPluginMigrations(database, migrations)).rejects.toThrow(
      "Plugin migration checksum mismatch: example:001_initial"
    );
    expect(database.transactionCount).toBe(0);
  });

  it("reports missing and mismatched plugin migrations separately", async () => {
    const database = new MigrationDatabase();
    const migrations = resolvePluginMigrations([
      pluginWithSql("select 1"),
      defineOwnAuthPlugin({
        id: "second",
        version: "1.0.0",
        migrations: [{ id: "001_initial", sql: "select 2" }]
      })
    ]);
    database.applied.set("example:001_initial", "old-checksum");

    const status = await inspectPluginMigrations(database, migrations);
    expect(status.missing.map(({ id }) => id)).toEqual(["second:001_initial"]);
    expect(status.checksumMismatches.map(({ migration }) => migration.id)).toEqual([
      "example:001_initial"
    ]);
  });
});

function pluginWithSql(sql: string) {
  return defineOwnAuthPlugin({
    id: "example",
    version: "1.0.0",
    migrations: [{ id: "001_initial", sql }]
  });
}

class MigrationDatabase implements PluginMigrationDatabase {
  readonly applied = new Map<string, string>();
  transactionCount = 0;

  async query<Row>(sql: string, params: readonly unknown[] = []) {
    if (sql.startsWith("select id, checksum")) {
      return {
        rows: [...this.applied].map(([id, checksum]) => ({ id, checksum })) as Row[]
      };
    }
    if (sql.startsWith("insert into own_auth_plugin_migrations")) {
      this.applied.set(String(params[0]), String(params[3]));
    }
    return { rows: [] as Row[] };
  }

  async transaction<Result>(
    work: (database: PluginMigrationDatabase) => Promise<Result>
  ): Promise<Result> {
    this.transactionCount += 1;
    return work(this);
  }
}
