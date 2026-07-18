import { describe, expect, it } from "vitest";
import { D1AuthStorage } from "../../src/d1/index.js";
import {
  fixtureNow,
  samlConnection,
  samlConnectionRow,
  samlIdentityCommit,
  samlTransactionRow
} from "../saml/saml-storage-fixtures.js";
import { RecordingD1 } from "./recording-d1.js";

describe("D1 SAML storage", () => {
  it("maps JSON and timestamp fields from D1 connection rows", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).samlStorage;
    database.queue([samlConnectionRow("d1")]);

    await expect(storage.getConnectionById("samlc_1")).resolves.toEqual(
      samlConnection()
    );
    expect(database.calls[0]?.sql).toContain("where id = ?1");
    expect(database.calls[0]?.values).toEqual(["samlc_1"]);
  });

  it("claims the assertion and transaction in one D1 batch", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).samlStorage;
    const expiresAt = new Date(fixtureNow.getTime() + 420_000);
    database.queue([{ assertion_hash: "assertion-hash" }]);
    database.queue([samlTransactionRow("d1")]);

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

    expect(database.calls).toHaveLength(2);
    expect(database.calls[0]?.sql).toContain(
      "insert into own_auth_saml_assertion_replays"
    );
    expect(database.calls[1]?.sql).toContain(
      "update own_auth_saml_transactions"
    );
    expect(database.calls[0]?.values).toEqual([
      "assertion-hash",
      "samlc_1",
      fixtureNow.getTime(),
      expiresAt.getTime(),
      "relay-hash",
      "request-hash"
    ]);
  });

  it("commits the complete SAML identity in one D1 batch", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).samlStorage;

    await storage.commitIdentity(samlIdentityCommit());

    expect(database.calls).toHaveLength(4);
    expect(database.calls.map((call) => call.sql)).toEqual([
      expect.stringContaining("insert into own_auth_users"),
      expect.stringContaining("insert into own_auth_accounts"),
      expect.stringContaining("insert into own_auth_organisation_members"),
      expect.stringContaining("insert into own_auth_audit_events")
    ]);
    expect(JSON.stringify(database.calls)).not.toContain("raw-name-id");
  });
});
