import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

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
    expect(output().stdout).toContain("create table if not exists own_auth_users");
    expect(output().stdout).toContain("002_external_providers");
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
});
