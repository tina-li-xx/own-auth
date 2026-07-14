import { describe, expect, it } from "vitest";
import {
  coreMigrationVersions
} from "../../src/core-migrations.js";
import {
  createPostgresTestDatabase,
  hasPostgresTestDatabase
} from "./postgres-test-database.js";

const describeWithDatabase = hasPostgresTestDatabase ? describe : describe.skip;

describeWithDatabase("core Postgres migrations", () => {
  it("applies every core migration to a fresh database", async () => {
    const database = await createPostgresTestDatabase();

    try {
      const result = await database.client.query<{ version: string }>(
        "select version from own_auth_migrations order by version"
      );

      expect(result.rows.map(({ version }) => version)).toEqual(coreMigrationVersions);
    } finally {
      await database.close();
    }
  });

  it("upgrades sessions from the 0.2.0 schema with safe assurance defaults", async () => {
    const createdAt = new Date("2026-01-01T12:00:00.000Z");
    const database = await createPostgresTestDatabase({
      async afterMigration(file, client) {
        if (file !== "002_external_providers.sql") {
          return;
        }

        await client.query(
          `insert into own_auth_users (
            id, email, password_hash, created_at, updated_at
          ) values ($1, $2, $3, $4, $4)`,
          ["usr_legacy", "legacy@example.com", "legacy-hash", createdAt]
        );
        await client.query(
          `insert into own_auth_sessions (
            id, user_id, token_hash, created_at, last_active_at, expires_at, idle_expires_at
          ) values ($1, $2, $3, $4, $4, $5, $5)`,
          [
            "ses_legacy",
            "usr_legacy",
            "legacy-token-hash",
            createdAt,
            new Date("2026-02-01T12:00:00.000Z")
          ]
        );
      }
    });

    try {
      const result = await database.client.query<{
        assuranceLevel: string;
        authenticatedAt: Date;
        authenticationMethods: string[];
        createdAt: Date;
      }>(
        `select
          authentication_methods as "authenticationMethods",
          assurance_level as "assuranceLevel",
          authenticated_at as "authenticatedAt",
          created_at as "createdAt"
        from own_auth_sessions
        where id = $1`,
        ["ses_legacy"]
      );

      expect(result.rows[0]).toMatchObject({
        assuranceLevel: "aal1",
        authenticationMethods: ["legacy"]
      });
      expect(result.rows[0]?.authenticatedAt).toEqual(result.rows[0]?.createdAt);
    } finally {
      await database.close();
    }
  });
});
