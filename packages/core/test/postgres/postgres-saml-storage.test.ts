import { describe, expect, it } from "vitest";
import { PostgresAuthStorage } from "../../src/postgres/index.js";
import {
  fixtureNow,
  samlConnection,
  samlConnectionRow,
  samlIdentityCommit,
  samlTransactionRow
} from "../saml/saml-storage-fixtures.js";
import { RecordingDb } from "./recording-postgres.js";

describe("Postgres SAML storage", () => {
  it("maps connections and parameterizes organisation lookup", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).samlStorage;
    db.queueRows([samlConnectionRow("postgres")]);

    await expect(storage.listConnectionsByOrganisationId("org_1")).resolves.toEqual([
      samlConnection()
    ]);
    expect(db.lastCall.sql).toContain(
      "select id, organisation_id, connection_key"
    );
    expect(db.lastCall.sql).toContain("where organisation_id = $1");
    expect(db.lastCall.params).toEqual(["org_1"]);
  });

  it("claims the transaction and assertion replay in one statement", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).samlStorage;
    const expiresAt = new Date(fixtureNow.getTime() + 420_000);
    db.queueRows([samlTransactionRow("postgres")]);

    await expect(storage.consumeResponse({
      relayStateHash: "relay-hash",
      requestIdHash: "request-hash",
      assertion: {
        assertionHash: "assertion-hash",
        connectionId: "samlc_1",
        consumedAt: fixtureNow,
        expiresAt
      },
      consumedAt: fixtureNow
    })).resolves.toMatchObject({ id: "samt_1" });

    expect(db.calls).toHaveLength(1);
    expect(db.lastCall.sql).toContain("update own_auth_saml_transactions");
    expect(db.lastCall.sql).toContain("insert into own_auth_saml_assertion_replays");
    expect(db.lastCall.sql).toContain("on conflict (assertion_hash) do nothing");
    expect(db.lastCall.params).toEqual([
      "relay-hash",
      "request-hash",
      fixtureNow,
      "assertion-hash",
      "samlc_1",
      expiresAt
    ]);
  });

  it("commits the user, account, membership, and audit event atomically", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).samlStorage;

    await storage.commitIdentity(samlIdentityCommit());

    expect(db.calls).toHaveLength(1);
    expect(db.lastCall.sql).toContain("with saml_user as");
    expect(db.lastCall.sql).toContain("insert into own_auth_accounts");
    expect(db.lastCall.sql).toContain("insert into own_auth_organisation_members");
    expect(db.lastCall.sql).toContain("insert into own_auth_audit_events");
    expect(db.lastCall.params).toContain("subject-hash");
    expect(JSON.stringify(db.calls)).not.toContain("raw-name-id");
  });
});
