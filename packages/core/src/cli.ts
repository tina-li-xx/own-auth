#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const { Pool } = pg;
interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}
interface ParsedArgs {
  command: "generate" | "migrate" | "help";
  databaseUrl?: string;
  out?: string;
  version: boolean;
}
const defaultIo: CliIo = {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message)
};
const migrationFiles = [
  "001_initial.sql",
  "002_external_providers.sql"
] as const;

export async function runCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = defaultIo
): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.version) {
      io.stdout(`${await readPackageVersion()}\n`);
      return 0;
    }
    if (args.command === "help") {
      io.stdout(helpText());
      return 0;
    }
    const sql = await readMigrationSql();
    if (args.command === "generate") {
      if (args.out) {
        const outPath = resolve(args.out);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, sql, "utf8");
        io.stdout(`Wrote Own Auth migration to ${outPath}\n`);
      } else {
        io.stdout(sql.endsWith("\n") ? sql : `${sql}\n`);
      }

      return 0;
    }
    const databaseUrl = args.databaseUrl ?? env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required. Set DATABASE_URL or pass --database-url.");
    }
    await migrate(databaseUrl, sql);
    io.stdout("Applied Own Auth core tables.\n");
    return 0;
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n\n`);
    io.stderr(helpText());
    return 1;
  }
}

export async function readMigrationSql(): Promise<string> {
  const migrations = await Promise.all(
    migrationFiles.map((file) => readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
  );

  return migrations.map((sql) => sql.trim()).join("\n\n") + "\n";
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: "help", version: false };
  }
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    return { command: "help", version: false };
  }
  if (command === "--version" || command === "-v") {
    return { command: "help", version: true };
  }
  if (command !== "generate" && command !== "migrate") {
    throw new Error(`Unknown command: ${command}`);
  }
  const parsed: ParsedArgs = { command, version: false };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--help" || arg === "-h") {
      return { command: "help", version: false };
    }
    if ((arg === "--out" || arg === "--output") && command === "generate") {
      parsed.out = requireValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--database-url" && command === "migrate") {
      parsed.databaseUrl = requireValue(rest, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option for ${command}: ${arg}`);
  }
  return parsed;
}

function requireValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function migrate(databaseUrl: string, sql: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

async function readPackageVersion(): Promise<string> {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const parsed = JSON.parse(packageJson) as { version?: string };
  return parsed.version ?? "unknown";
}

function helpText(): string {
  return `Own Auth CLI

Usage:
  own-auth generate [--out <file>]
  own-auth migrate [--database-url <url>]

Commands:
  generate  Print the SQL migration, or write it with --out.
  migrate   Apply the SQL migration to DATABASE_URL.

Options:
  --out, --output       Write generated SQL to a file.
  --database-url        Use this database URL instead of DATABASE_URL.
  --help                Show this help.
  --version             Show the package version.
`;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return fileURLToPath(import.meta.url) === resolve(entry);
  }
}

if (isDirectRun()) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
