import { describe, expect, it } from "vitest";
import { PostgresAuthStorage } from "../../src/postgres/index.js";
import {
  fixtureAuditEvent,
  scimConnection,
  scimConnectionRow,
  scimFixtureNow,
  scimProvisionCommit,
  scimUserRow
} from "../scim/scim-storage-fixtures.js";
import { RecordingDb } from "./recording-postgres.js";

describe("Postgres SCIM storage", () => {
  it("maps connections and parameterizes organisation lookup", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).scimStorage;
    db.queueRows([scimConnectionRow("postgres")]);

    await expect(storage.listConnectionsByOrganisationId("org_1")).resolves.toEqual([
      scimConnection()
    ]);
    expect(db.lastCall.sql).toContain("where organisation_id = $1");
    expect(db.lastCall.params).toEqual(["org_1"]);
  });

  it("commits the user, membership, resource, and audit event atomically", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).scimStorage;

    await storage.commitProvision(scimProvisionCommit());

    expect(db.calls).toHaveLength(1);
    expect(db.lastCall.sql).toContain("with scim_user_account as");
    expect(db.lastCall.sql).toContain("insert into own_auth_organisation_members");
    expect(db.lastCall.sql).toContain("insert into own_auth_scim_users");
    expect(db.lastCall.sql).toContain("insert into own_auth_audit_events");
  });

  it("updates membership and resource version through one statement", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).scimStorage;
    db.queueRows([{ ...scimUserRow("postgres"), active: false, version: 2 }]);

    await expect(storage.mutateUser({
      id: "scimu_1",
      expectedVersion: 1,
      patch: { active: false, updatedAt: scimFixtureNow },
      membershipPatch: { status: "suspended", updatedAt: scimFixtureNow },
      auditEvent: { ...fixtureAuditEvent(), eventType: "scim.user_suspended" }
    })).resolves.toMatchObject({ active: false, version: 2 });

    expect(db.calls).toHaveLength(1);
    expect(db.lastCall.sql).toContain("updated_member as");
    expect(db.lastCall.sql).toContain("version = version + 1");
    expect(db.lastCall.sql).toContain("where id = $1 and version = $2");
    expect(db.lastCall.sql).toContain("insert into own_auth_audit_events");
  });

  it("verifies a paired email and writes its audit event conditionally", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).scimStorage;
    db.queueRows([{ id: "usr_scimu_1" }]);

    await expect(storage.verifyPairedSamlEmail({
      userId: "usr_scimu_1",
      normalizedEmail: "scimu_1@example.com",
      verifiedAt: scimFixtureNow,
      auditEvent: { ...fixtureAuditEvent(), eventType: "email.verified" }
    })).resolves.toBe(true);

    expect(db.calls).toHaveLength(1);
    expect(db.lastCall.sql).toContain("email_verified_at is null");
    expect(db.lastCall.sql).toContain("insert into own_auth_audit_events");
  });

  it("fails closed when a paired SAML email maps to multiple active resources", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).scimStorage;
    db.queueRows([scimUserRow("postgres", "scimu_1"), scimUserRow("postgres", "scimu_2")]);

    await expect(storage.findActiveUserBySamlConnection(
      "samlc_1",
      "duplicate@example.com"
    )).resolves.toBeNull();
    expect(db.lastCall.sql).toContain("limit 2");
  });
});
