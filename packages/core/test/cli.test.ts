import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runCli,
  type CliDependencies
} from "../src/cli.js";
import { coreMigrationVersions } from "../src/core-migrations.js";

function createIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout(message: string) {
        stdout += message;
      },
      stderr(message: string) {
        stderr += message;
      }
    },
    output() {
      return { stdout, stderr };
    }
  };
}

describe("own-auth CLI", () => {
  it("generates the core migration SQL by default", async () => {
    const { io, output } = createIo();
    const exitCode = await runCli(["generate"], {}, io);

    expect(exitCode).toBe(0);
    expect(output().stdout).toContain("create table if not exists own_auth_migrations");
    expect(output().stdout).toContain("create table if not exists own_auth_users");
    expect(output().stdout).toContain("002_external_providers");
    expect(output().stdout).toContain("007_plugin_migrations");
    expect(output().stderr).toBe("");
  });

  it("writes generated SQL to an output file", async () => {
    const { io, output } = createIo();
    const file = join(tmpdir(), `own-auth-${Date.now()}.sql`);
    const exitCode = await runCli(["generate", "--out", file], {}, io);

    expect(exitCode).toBe(0);
    expect(output().stdout).toContain("Wrote Own Auth migration");
    await expect(readFile(file, "utf8")).resolves.toContain("own_auth_users");
  });

  it("requires a database URL before migrating", async () => {
    const { io, output } = createIo();
    const exitCode = await runCli(["migrate"], {}, io);

    expect(exitCode).toBe(1);
    expect(output().stderr).toContain("DATABASE_URL is required");
  });

  it("requires a database URL before checking status", async () => {
    const { io, output } = createIo();
    const exitCode = await runCli(["status"], {}, io);

    expect(exitCode).toBe(1);
    expect(output().stderr).toContain("DATABASE_URL is required");
  });

  it("reports a connected database at the current migration version", async () => {
    const { dependencies, ended, queries } = statusDatabase(coreMigrationVersions);
    const { io, output } = createIo();
    const exitCode = await runCli(
      ["status"],
      { DATABASE_URL: "postgres://example.test/own_auth" },
      io,
      dependencies
    );

    expect(exitCode).toBe(0);
    expect(output().stdout).toBe(
      "Database: connected\n" +
      "Migration version: 007_plugin_migrations\n" +
      "Status: current\n"
    );
    expect(output().stderr).toBe("");
    expect(queries.every((sql) => sql.startsWith("select "))).toBe(true);
    expect(ended()).toBe(true);
  });

  it("reports when the database has not been migrated", async () => {
    const { dependencies, ended } = statusDatabase([], false);
    const { io, output } = createIo();
    const exitCode = await runCli(
      ["status"],
      { DATABASE_URL: "postgres://example.test/own_auth" },
      io,
      dependencies
    );

    expect(exitCode).toBe(1);
    expect(output().stdout).toBe(
      "Database: connected\n" +
      "Migration version: none\n" +
      "Status: migrations required\n"
    );
    expect(output().stderr).toBe("");
    expect(ended()).toBe(true);
  });

  it("reports when a database migration is still pending", async () => {
    const { dependencies } = statusDatabase(["001_initial"]);
    const { io, output } = createIo();
    const exitCode = await runCli(
      ["status"],
      { DATABASE_URL: "postgres://example.test/own_auth" },
      io,
      dependencies
    );

    expect(exitCode).toBe(1);
    expect(output().stdout).toBe(
      "Database: connected\n" +
      "Migration version: 001_initial\n" +
      "Status: migrations required\n"
    );
    expect(output().stderr).toBe("");
  });
});

function statusDatabase(versions: readonly string[], tableExists = true) {
  const queries: string[] = [];
  let databaseEnded = false;

  const dependencies: CliDependencies = {
    createDatabase(databaseUrl) {
      expect(databaseUrl).toBe("postgres://example.test/own_auth");
      return {
        async query<Row>(sql: string) {
          queries.push(sql);

          if (sql.includes("to_regclass")) {
            return {
              rows: [{ tableName: tableExists ? "own_auth_migrations" : null }] as unknown as Row[]
            };
          }

          return {
            rows: versions.map((version) => ({ version })) as unknown as Row[]
          };
        },
        async end() {
          databaseEnded = true;
        }
      };
    }
  };

  return {
    dependencies,
    ended: () => databaseEnded,
    queries
  };
}
