import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createOwnAuth,
  MemoryEmailProvider,
  MemorySmsProvider
} from "../../src/index.js";
import { PostgresAuthStorage, PostgresRateLimitStore } from "../../src/postgres/index.js";
import {
  createPostgresTestDatabase,
  hasPostgresTestDatabase,
  type PostgresTestDatabase
} from "./postgres-test-database.js";

const describeWithDatabase = hasPostgresTestDatabase ? describe : describe.skip;

describeWithDatabase("PostgresAuthStorage integration", () => {
  let database: PostgresTestDatabase;
  let client: pg.PoolClient;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    client = database.client;
  });

  afterAll(async () => {
    await database?.close();
  });

  it("runs real auth flows against migrated Postgres tables without storing raw secrets", async () => {
    const emailProvider = new MemoryEmailProvider();
    const smsProvider = new MemorySmsProvider();
    const auth = createOwnAuth({
      storage: new PostgresAuthStorage(client),
      rateLimitStore: new PostgresRateLimitStore(client),
      emailProvider,
      smsProvider,
      exposeRawTokens: true,
      tokenPepper: "integration-test-pepper"
    });

    const signup = await auth.signUpEmailPassword({
      email: "postgres@example.com",
      password: "correct-horse"
    });
    const current = await auth.requireCurrentSession(signup.sessionToken);

    expect(current.user.email).toBe("postgres@example.com");

    await auth.requestMagicLink({ email: "postgres@example.com" });
    const magicToken = emailProvider.messages.at(-1)?.token ?? "";
    const magicSession = await auth.verifyMagicLink({ token: magicToken });

    expect(magicSession.user.id).toBe(signup.user.id);

    const externalSession = await auth.signInWithVerifiedExternalIdentity({
      provider: "google",
      providerAccountId: "postgres-google-user",
      email: "postgres-google@example.com",
      emailVerified: true
    });

    expect(externalSession.user.email).toBe("postgres-google@example.com");

    const { organisation } = await auth.createOrganisation({
      name: "Postgres Co",
      ownerUserId: signup.user.id
    });
    const createdKey = await auth.createApiKey({
      name: "Integration key",
      organisationId: organisation.id,
      actorUserId: signup.user.id,
      scopes: ["read users"]
    });
    const verifiedKey = await auth.verifyApiKey(createdKey.rawKey, ["read users"]);

    expect(verifiedKey.organisation?.id).toBe(organisation.id);

    const passwordRow = await client.query<{ password_hash: string }>(
      "select password_hash from own_auth_users where id = $1",
      [signup.user.id]
    );
    const sessionRow = await client.query<{ token_hash: string }>(
      "select token_hash from own_auth_sessions where id = $1",
      [signup.session.id]
    );
    const magicTokenRow = await client.query<{ token_hash: string }>(
      "select token_hash from own_auth_tokens where type = 'magic_link' order by created_at desc limit 1"
    );
    const apiKeyRow = await client.query<{ key_hash: string; last_used_at: Date | null }>(
      "select key_hash, last_used_at from own_auth_api_keys where id = $1",
      [createdKey.apiKey.id]
    );
    const auditRows = await client.query<{ event_type: string }>(
      "select event_type from own_auth_audit_events where organisation_id = $1 order by created_at asc",
      [organisation.id]
    );
    const externalAccountRows = await client.query<{ provider: string }>(
      "select provider from own_auth_accounts where provider = 'google'"
    );
    const rateLimitRows = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_rate_limits"
    );

    expect(passwordRow.rows[0]?.password_hash).not.toBe("correct-horse");
    expect(sessionRow.rows[0]?.token_hash).not.toBe(signup.sessionToken);
    expect(magicTokenRow.rows[0]?.token_hash).not.toBe(magicToken);
    expect(apiKeyRow.rows[0]?.key_hash).not.toBe(createdKey.rawKey);
    expect(apiKeyRow.rows[0]?.last_used_at).toBeInstanceOf(Date);
    expect(auditRows.rows.map((row) => row.event_type)).toEqual(
      expect.arrayContaining(["organisation.created", "api_key.created", "api_key.used"])
    );
    expect(externalAccountRows.rows).toEqual([{ provider: "google" }]);
    expect(rateLimitRows.rows[0]?.count).toBeGreaterThan(0);

    await auth.inviteMember({
      organisationId: organisation.id,
      email: "pending-postgres@example.com",
      invitedByUserId: signup.user.id
    });
    const deletedOrganisation = await auth.deleteOrganisation({
      organisationId: organisation.id,
      actorUserId: signup.user.id
    });

    const organisationCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_organisations where id = $1",
      [organisation.id]
    );
    const memberCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_organisation_members where organisation_id = $1",
      [organisation.id]
    );
    const invitationCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_invitations where organisation_id = $1",
      [organisation.id]
    );
    const organisationKeyCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_api_keys where organisation_id = $1",
      [organisation.id]
    );
    const organisationTokenCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_tokens where organisation_id = $1",
      [organisation.id]
    );
    const ownerCount = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_users where id = $1",
      [signup.user.id]
    );
    const deletionAudit = await client.query<{
      organisation_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      "select organisation_id, metadata from own_auth_audit_events where event_type = 'organisation.deleted' order by created_at desc limit 1"
    );

    expect(deletedOrganisation.id).toBe(organisation.id);
    expect(organisationCount.rows[0]?.count).toBe(0);
    expect(memberCount.rows[0]?.count).toBe(0);
    expect(invitationCount.rows[0]?.count).toBe(0);
    expect(organisationKeyCount.rows[0]?.count).toBe(0);
    expect(organisationTokenCount.rows[0]?.count).toBe(0);
    expect(ownerCount.rows[0]?.count).toBe(1);
    expect(deletionAudit.rows[0]).toMatchObject({
      organisation_id: null,
      metadata: {
        organisationId: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        membersRemoved: 1,
        apiKeysRemoved: 1,
        invitationsRemoved: 1
      }
    });
    await expect(auth.requireCurrentSession(signup.sessionToken)).resolves.toMatchObject({
      user: { id: signup.user.id }
    });

    const deletedAuditEvents = await auth.cleanupAuditLogs({
      olderThan: new Date(Date.now() + 1_000)
    });
    const remainingAuditEvents = await client.query<{ count: number }>(
      "select count(*)::int as count from own_auth_audit_events"
    );

    expect(deletedAuditEvents).toBeGreaterThan(0);
    expect(remainingAuditEvents.rows[0]?.count).toBe(0);
  });
});
