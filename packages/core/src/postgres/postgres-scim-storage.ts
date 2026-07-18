import { auditEventColumns, organisationMemberColumns, userColumns } from "../database-schema.js";
import { databaseColumnEntries } from "../database-types.js";
import { mapScimConnection, mapScimToken, mapScimUser } from "../scim-database-mappers.js";
import {
  scimConnectionColumns,
  scimConnectionReturning,
  scimTokenColumns,
  scimTokenReturning,
  scimUserColumns,
  scimUserReturning
} from "../scim-database-schema.js";
import type { ScimStorage } from "../scim-storage.js";
import type {
  ScimConnection,
  ScimEmailVerificationCommit,
  ScimProvisionCommit,
  ScimToken,
  ScimUser,
  ScimUserFilter,
  ScimUserMutation,
  ScimUserPage
} from "../scim-types.js";
import { addInsertCte } from "./postgres-atomic.js";
import { toPostgresValue } from "./postgres-row.js";
import { PostgresStorageBase } from "./postgres-storage-base.js";
import type { PostgresQueryable, Row } from "./postgres-types.js";

export class PostgresScimStorage extends PostgresStorageBase implements ScimStorage {
  constructor(db: PostgresQueryable) { super(db); }

  async createConnection(connection: ScimConnection): Promise<ScimConnection> {
    return mapScimConnection(await this.insertOne(
      "own_auth_scim_connections", scimConnectionColumns, connection, scimConnectionReturning
    ));
  }

  async getConnectionById(id: string): Promise<ScimConnection | null> {
    const row = await this.selectOne(
      `${scimConnectionReturning} from own_auth_scim_connections where id = $1`, [id]
    );
    return row ? mapScimConnection(row) : null;
  }

  async listConnectionsByOrganisationId(organisationId: string): Promise<ScimConnection[]> {
    const rows = await this.selectMany(
      `${scimConnectionReturning} from own_auth_scim_connections ` +
      "where organisation_id = $1 order by created_at asc", [organisationId]
    );
    return rows.map(mapScimConnection);
  }

  async updateConnection(id: string, patch: Partial<ScimConnection>): Promise<ScimConnection | null> {
    const safePatch = {
      ...patch,
      id: undefined,
      organisationId: undefined,
      key: undefined,
      createdAt: undefined
    };
    const row = await this.updateOne(
      "own_auth_scim_connections", scimConnectionColumns, id, safePatch, scimConnectionReturning
    );
    return row ? mapScimConnection(row) : null;
  }

  async createToken(token: ScimToken): Promise<ScimToken> {
    return mapScimToken(await this.insertOne(
      "own_auth_scim_tokens", scimTokenColumns, token, scimTokenReturning
    ));
  }

  async getTokenById(id: string): Promise<ScimToken | null> {
    const row = await this.selectOne(
      `${scimTokenReturning} from own_auth_scim_tokens where id = $1`, [id]
    );
    return row ? mapScimToken(row) : null;
  }

  async getTokenByHash(tokenHash: string): Promise<ScimToken | null> {
    const row = await this.selectOne(
      `${scimTokenReturning} from own_auth_scim_tokens where token_hash = $1`, [tokenHash]
    );
    return row ? mapScimToken(row) : null;
  }

  async listTokensByConnectionId(connectionId: string): Promise<ScimToken[]> {
    const rows = await this.selectMany(
      `${scimTokenReturning} from own_auth_scim_tokens ` +
      "where connection_id = $1 order by created_at desc", [connectionId]
    );
    return rows.map(mapScimToken);
  }

  async updateToken(id: string, patch: Partial<ScimToken>): Promise<ScimToken | null> {
    const safePatch = {
      ...patch,
      id: undefined,
      connectionId: undefined,
      prefix: undefined,
      tokenHash: undefined,
      createdAt: undefined
    };
    const row = await this.updateOne(
      "own_auth_scim_tokens", scimTokenColumns, id, safePatch, scimTokenReturning
    );
    return row ? mapScimToken(row) : null;
  }

  async getUserById(id: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users where id = $1`, [id]
    );
    return row ? mapScimUser(row) : null;
  }

  async getUserByExternalId(connectionId: string, externalId: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = $1 and external_id = $2", [connectionId, externalId]
    );
    return row ? mapScimUser(row) : null;
  }

  async getUserByUserName(connectionId: string, normalizedUserName: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = $1 and normalized_user_name = $2",
      [connectionId, normalizedUserName]
    );
    return row ? mapScimUser(row) : null;
  }

  async getActiveUserByEmail(connectionId: string, normalizedEmail: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = $1 and normalized_email = $2 and deleted_at is null",
      [connectionId, normalizedEmail]
    );
    return row ? mapScimUser(row) : null;
  }

  async listUsers(
    connectionId: string,
    filter: ScimUserFilter | null,
    startIndex: number,
    count: number
  ): Promise<ScimUserPage> {
    const params: unknown[] = [connectionId];
    const where = ["connection_id = $1", "deleted_at is null"];
    if (filter) {
      params.push(filter.value);
      const column = filter.attribute === "userName"
        ? "normalized_user_name"
        : filter.attribute === "externalId" ? "external_id" : "id";
      where.push(`${column} = $${params.length}`);
    }
    const total = await this.db.query<{ total: number | string }>(
      `select count(*) as total from own_auth_scim_users where ${where.join(" and ")}`,
      params
    );
    params.push(count, startIndex - 1);
    const rows = await this.db.query<Row>(
      `select ${scimUserReturning} from own_auth_scim_users ` +
      `where ${where.join(" and ")} order by created_at asc, id asc ` +
      `limit $${params.length - 1} offset $${params.length}`,
      params
    );
    return {
      users: rows.rows.map(mapScimUser),
      totalResults: Number(total.rows[0]?.total ?? 0)
    };
  }

  async listUsersByOrganisationAndUser(organisationId: string, userId: string): Promise<ScimUser[]> {
    const rows = await this.selectMany(
      `u.${scimUserReturning.split(", ").join(", u.")} from own_auth_scim_users u ` +
      "join own_auth_scim_connections c on c.id = u.connection_id " +
      "where c.organisation_id = $1 and u.user_id = $2", [organisationId, userId]
    );
    return rows.map(mapScimUser);
  }

  async findActiveUserBySamlConnection(
    samlConnectionId: string,
    normalizedEmail: string
  ): Promise<ScimUser | null> {
    const selected = scimUserReturning.split(", ").map((column) => `u.${column}`).join(", ");
    const rows = await this.selectMany(
      `${selected} from own_auth_scim_users u ` +
      "join own_auth_scim_connections c on c.id = u.connection_id " +
      "where c.saml_connection_id = $1 and c.disabled_at is null " +
      "and u.normalized_email = $2 and u.active = true and u.deleted_at is null limit 2",
      [samlConnectionId, normalizedEmail]
    );
    return rows.length === 1 ? mapScimUser(rows[0]!) : null;
  }

  async commitProvision(input: ScimProvisionCommit): Promise<void> {
    const params: unknown[] = [];
    const ctes: string[] = [];
    let dependency: string | undefined;
    if (input.user) {
      dependency = addInsertCte(
        ctes, params, "scim_user_account", "own_auth_users", userColumns, input.user
      );
    }
    dependency = addInsertCte(
      ctes, params, "scim_membership", "own_auth_organisation_members",
      organisationMemberColumns, input.membership, dependency
    );
    dependency = addInsertCte(
      ctes, params, "scim_resource", "own_auth_scim_users",
      scimUserColumns, input.scimUser, dependency
    );
    input.auditEvents.forEach((event, index) => {
      dependency = addInsertCte(
        ctes, params, `scim_audit_${index}`, "own_auth_audit_events",
        auditEventColumns, event, dependency
      );
    });
    await this.db.query(`with ${ctes.join(", ")} select 1`, params);
  }

  async mutateUser(input: ScimUserMutation): Promise<ScimUser | null> {
    const params: unknown[] = [input.id, input.expectedVersion];
    const memberEntries = databaseColumnEntries(organisationMemberColumns, input.membershipPatch ?? {})
      .filter(([key]) => !["id", "organisationId", "userId", "role", "createdAt"].includes(key));
    const userEntries = databaseColumnEntries(scimUserColumns, input.patch)
      .filter(([key]) => ![
        "id", "connectionId", "userId", "membershipId", "version", "createdAt"
      ].includes(key));
    const ctes = [
      "target as (select membership_id from own_auth_scim_users where id = $1 and version = $2)"
    ];
    if (memberEntries.length > 0) {
      const assignments = memberEntries.map(([key, column]) => {
        params.push(toPostgresValue(input.membershipPatch?.[key]));
        return `${column} = $${params.length}`;
      });
      ctes.push(
        "updated_member as (update own_auth_organisation_members m set " +
        `${assignments.join(", ")} from target where m.id = target.membership_id returning m.id)`
      );
    }
    const assignments = userEntries.map(([key, column]) => {
      params.push(toPostgresValue(input.patch[key]));
      return `${column} = $${params.length}`;
    });
    assignments.push("version = version + 1");
    const dependency = memberEntries.length > 0
      ? " and exists (select 1 from updated_member)"
      : "";
    ctes.push(
      "updated_scim as (update own_auth_scim_users set " + assignments.join(", ") +
      ` where id = $1 and version = $2${dependency} returning ${scimUserReturning})`
    );
    if (input.auditEvent) {
      const entries = databaseColumnEntries(auditEventColumns, input.auditEvent);
      const values = entries.map(([key]) => {
        params.push(toPostgresValue(input.auditEvent?.[key]));
        return `$${params.length}`;
      });
      ctes.push(
        `audited as (insert into own_auth_audit_events (` +
        `${entries.map(([, column]) => column).join(", ")}) ` +
        `select ${values.join(", ")} from updated_scim returning id)`
      );
    }
    const selected = scimUserReturning.split(", ")
      .map((column) => `updated_scim.${column}`).join(", ");
    const result = await this.db.query<Row>(
      `with ${ctes.join(", ")} select ${selected} from updated_scim` +
      `${input.auditEvent ? " cross join audited" : ""}`,
      params
    );
    return result.rows[0] ? mapScimUser(result.rows[0]) : null;
  }

  async verifyPairedSamlEmail(input: ScimEmailVerificationCommit): Promise<boolean> {
    const entries = databaseColumnEntries(auditEventColumns, input.auditEvent);
    const params: unknown[] = [input.userId, input.normalizedEmail, input.verifiedAt];
    const values = entries.map(([key]) => {
      params.push(toPostgresValue(input.auditEvent[key]));
      return `$${params.length}`;
    });
    const result = await this.db.query<{ id: string }>(
      `with verified as (
         update own_auth_users set email_verified_at = $3, updated_at = $3
         where id = $1 and email = $2 and email_verified_at is null returning id
       ), audited as (
         insert into own_auth_audit_events (${entries.map(([, column]) => column).join(", ")})
         select ${values.join(", ")} from verified returning id
       ) select verified.id from verified cross join audited`,
      params
    );
    return result.rows.length === 1;
  }
}
