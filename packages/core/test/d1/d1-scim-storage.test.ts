import { describe, expect, it } from "vitest";
import { D1AuthStorage } from "../../src/d1/index.js";
import {
  fixtureAuditEvent,
  scimConnection,
  scimConnectionRow,
  scimFixtureNow,
  scimProvisionCommit,
  scimUserRow
} from "../scim/scim-storage-fixtures.js";
import { RecordingD1 } from "./recording-d1.js";

describe("D1 SCIM storage", () => {
  it("maps connection timestamps and fields", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).scimStorage;
    database.queue([scimConnectionRow("d1")]);

    await expect(storage.getConnectionById("scimc_1")).resolves.toEqual(scimConnection());
    expect(database.calls[0]?.sql).toContain("where id = ?1");
  });

  it("commits the complete SCIM identity in one D1 batch", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).scimStorage;

    await storage.commitProvision(scimProvisionCommit());

    expect(database.calls.map((call) => call.sql)).toEqual([
      expect.stringContaining("insert into own_auth_users"),
      expect.stringContaining("insert into own_auth_organisation_members"),
      expect.stringContaining("insert into own_auth_scim_users"),
      expect.stringContaining("insert into own_auth_audit_events")
    ]);
  });

  it("updates membership and resource version in one D1 batch", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).scimStorage;
    database.queue([{ id: "evt_scim_1" }]);
    database.queue([]);
    database.queue([{ ...scimUserRow("d1"), active: 0, version: 2 }]);

    await expect(storage.mutateUser({
      id: "scimu_1",
      expectedVersion: 1,
      patch: { active: false, updatedAt: scimFixtureNow },
      membershipPatch: { status: "suspended", updatedAt: scimFixtureNow },
      auditEvent: { ...fixtureAuditEvent(), eventType: "scim.user_suspended" }
    })).resolves.toMatchObject({ active: false, version: 2 });

    expect(database.calls).toHaveLength(3);
    expect(database.calls[0]?.sql).toContain("own_auth_audit_events");
    expect(database.calls[1]?.sql).toContain("own_auth_organisation_members");
    expect(database.calls[2]?.sql).toContain("version = version + 1");
  });

  it("verifies a paired email and writes its audit event in one D1 batch", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).scimStorage;
    database.queue([{ id: "evt_scim_1" }]);
    database.queue([{ id: "usr_scimu_1" }]);

    await expect(storage.verifyPairedSamlEmail({
      userId: "usr_scimu_1",
      normalizedEmail: "scimu_1@example.com",
      verifiedAt: scimFixtureNow,
      auditEvent: { ...fixtureAuditEvent(), eventType: "email.verified" }
    })).resolves.toBe(true);

    expect(database.calls).toHaveLength(2);
    expect(database.calls[0]?.sql).toContain("email_verified_at is null");
    expect(database.calls[1]?.sql).toContain("email_verified_at is null");
  });
});
