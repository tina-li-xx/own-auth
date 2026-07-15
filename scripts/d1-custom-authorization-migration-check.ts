import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreMigrationFiles } from "../packages/core/src/database-metadata.js";
import { isRecord } from "../packages/core/src/value-guards.js";

interface CustomAuthorizationMigrationCheckOptions {
  persistenceDirectory: string;
  runWrangler(args: string[]): Promise<void>;
  runWranglerCapture(args: string[]): Promise<string>;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const databaseName = "own-auth-custom-authorization-migration";
const customAuthorizationMigration = "009_custom_authorization.sql";

export async function assertCustomAuthorizationD1Migration(
  options: CustomAuthorizationMigrationCheckOptions
): Promise<void> {
  const fixtureRoot = join(options.persistenceDirectory, "custom-authorization-migration");
  const migrationsDirectory = join(fixtureRoot, "migrations");
  const fixturePersistence = join(fixtureRoot, "data");
  const fixtureConfig = join(fixtureRoot, "wrangler.json");
  const seedFile = join(fixtureRoot, "seed.sql");
  const migrationIndex = coreMigrationFiles.indexOf(customAuthorizationMigration);
  if (migrationIndex < 0) {
    throw new Error("D1 custom authorization migration is missing from the migration registry");
  }

  await mkdir(migrationsDirectory, { recursive: true });
  for (const file of coreMigrationFiles.slice(0, migrationIndex)) {
    await copyFile(
      join(repositoryRoot, "packages/core/migrations/d1", file),
      join(migrationsDirectory, file)
    );
  }
  await writeFile(fixtureConfig, JSON.stringify({
    name: databaseName,
    main: join(repositoryRoot, "packages/core/test/cloudflare/worker.ts"),
    compatibility_date: "2026-07-12",
    d1_databases: [{
      binding: "DB",
      database_name: databaseName,
      database_id: "00000000-0000-0000-0000-000000000009",
      migrations_dir: "./migrations"
    }]
  }));

  await runLocalD1(options, fixtureConfig, fixturePersistence, ["migrations", "apply"]);
  await writeFile(seedFile, largeRoleMigrationSeed());
  await runLocalD1(options, fixtureConfig, fixturePersistence, ["execute", "--file", seedFile]);

  await copyFile(
    join(repositoryRoot, "packages/core/migrations/d1", customAuthorizationMigration),
    join(migrationsDirectory, customAuthorizationMigration)
  );
  await runLocalD1(options, fixtureConfig, fixturePersistence, ["migrations", "apply"]);
  await runLocalD1(options, fixtureConfig, fixturePersistence, [
    "execute",
    "--command",
    "update own_auth_organisation_members set role = 'reviewer' where id = 'mem_0001'"
  ]);

  const result = await inspectMigratedRows(options, fixtureConfig, fixturePersistence);
  if (
    result.member_count !== 3_000 ||
    result.invitation_count !== 3_000 ||
    result.custom_role !== "reviewer"
  ) {
    throw new Error("D1 custom authorization migration did not preserve seeded role data");
  }
}

async function runLocalD1(
  options: CustomAuthorizationMigrationCheckOptions,
  fixtureConfig: string,
  fixturePersistence: string,
  args: string[]
): Promise<void> {
  const command = args[0] === "migrations"
    ? ["d1", "migrations", args[1] ?? "apply", databaseName, ...args.slice(2)]
    : ["d1", "execute", databaseName, ...args.slice(1)];
  await options.runWrangler([
    ...command,
    "--local",
    "--config",
    fixtureConfig,
    "--persist-to",
    fixturePersistence
  ].filter(Boolean));
}

async function inspectMigratedRows(
  options: CustomAuthorizationMigrationCheckOptions,
  fixtureConfig: string,
  fixturePersistence: string
): Promise<Record<string, unknown>> {
  const output = await options.runWranglerCapture([
    "d1",
    "execute",
    databaseName,
    "--local",
    "--config",
    fixtureConfig,
    "--persist-to",
    fixturePersistence,
    "--command",
    "select " +
      "(select count(*) from own_auth_organisation_members) as member_count, " +
      "(select count(*) from own_auth_invitations) as invitation_count, " +
      "(select role from own_auth_organisation_members where id = 'mem_0001') as custom_role",
    "--json"
  ]);
  const payload = JSON.parse(output) as unknown;
  const first = Array.isArray(payload) ? payload[0] : null;
  const rows = isRecord(first) && Array.isArray(first.results) ? first.results : [];
  const row = rows[0];
  if (!isRecord(row)) throw new Error("D1 migration inspection returned no row");
  return row;
}

function largeRoleMigrationSeed(): string {
  const numbers = `
    with digits(value) as (
      values (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)
    ), numbers(value) as (
      select ones.value + tens.value * 10 + hundreds.value * 100 + thousands.value * 1000 + 1
      from digits ones
      cross join digits tens
      cross join digits hundreds
      cross join digits thousands
      where ones.value + tens.value * 10 + hundreds.value * 100 + thousands.value * 1000 < 3000
    )`;
  return `
    ${numbers}
    insert into own_auth_users (id, email, metadata, created_at, updated_at)
    select printf('usr_%04d', value), printf('user-%04d@example.com', value), '{}', 1, 1
    from numbers;

    insert into own_auth_organisations
      (id, name, slug, owner_user_id, metadata, created_at, updated_at)
    values ('org_large', 'Large migration', 'large-migration', 'usr_0001', '{}', 1, 1);

    ${numbers}
    insert into own_auth_organisation_members
      (id, organisation_id, user_id, role, status, joined_at, created_at, updated_at)
    select
      printf('mem_%04d', value), 'org_large', printf('usr_%04d', value),
      case value % 3 when 0 then 'owner' when 1 then 'admin' else 'member' end,
      'active', 1, 1, 1
    from numbers;

    ${numbers}
    insert into own_auth_invitations
      (id, organisation_id, email, role, invited_by_user_id, status, expires_at, created_at)
    select
      printf('inv_%04d', value), 'org_large', printf('invite-%04d@example.com', value),
      case value % 3 when 0 then 'owner' when 1 then 'admin' else 'member' end,
      'usr_0001', 'pending', 9999999999999, 1
    from numbers;
  `;
}
