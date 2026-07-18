import { auditEventColumns, organisationMemberColumns, userColumns } from "../database-schema.js";
import { databaseColumnEntries, type DatabaseRow } from "../database-types.js";
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
import { D1StorageBase } from "./d1-storage-base.js";
import type { D1DatabaseLike, D1PreparedStatementLike } from "./d1-types.js";

export class D1ScimStorage extends D1StorageBase implements ScimStorage {
  constructor(db: D1DatabaseLike) { super(db); }

  async createConnection(connection: ScimConnection): Promise<ScimConnection> {
    return mapScimConnection(await this.insertOne(
      "own_auth_scim_connections", scimConnectionColumns, connection, scimConnectionReturning
    ));
  }

  async getConnectionById(id: string): Promise<ScimConnection | null> {
    const row = await this.selectOne(
      `${scimConnectionReturning} from own_auth_scim_connections where id = ?1`, [id]
    );
    return row ? mapScimConnection(row) : null;
  }

  async listConnectionsByOrganisationId(organisationId: string): Promise<ScimConnection[]> {
    const rows = await this.selectMany(
      `${scimConnectionReturning} from own_auth_scim_connections ` +
      "where organisation_id = ?1 order by created_at asc", [organisationId]
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
      `${scimTokenReturning} from own_auth_scim_tokens where id = ?1`, [id]
    );
    return row ? mapScimToken(row) : null;
  }

  async getTokenByHash(tokenHash: string): Promise<ScimToken | null> {
    const row = await this.selectOne(
      `${scimTokenReturning} from own_auth_scim_tokens where token_hash = ?1`, [tokenHash]
    );
    return row ? mapScimToken(row) : null;
  }

  async listTokensByConnectionId(connectionId: string): Promise<ScimToken[]> {
    const rows = await this.selectMany(
      `${scimTokenReturning} from own_auth_scim_tokens ` +
      "where connection_id = ?1 order by created_at desc", [connectionId]
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
      `${scimUserReturning} from own_auth_scim_users where id = ?1`, [id]
    );
    return row ? mapScimUser(row) : null;
  }

  async getUserByExternalId(connectionId: string, externalId: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = ?1 and external_id = ?2", [connectionId, externalId]
    );
    return row ? mapScimUser(row) : null;
  }

  async getUserByUserName(connectionId: string, normalizedUserName: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = ?1 and normalized_user_name = ?2",
      [connectionId, normalizedUserName]
    );
    return row ? mapScimUser(row) : null;
  }

  async getActiveUserByEmail(connectionId: string, normalizedEmail: string): Promise<ScimUser | null> {
    const row = await this.selectOne(
      `${scimUserReturning} from own_auth_scim_users ` +
      "where connection_id = ?1 and normalized_email = ?2 and deleted_at is null",
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
    const values: unknown[] = [connectionId];
    const where = ["connection_id = ?1", "deleted_at is null"];
    if (filter) {
      values.push(filter.value);
      const column = filter.attribute === "userName"
        ? "normalized_user_name"
        : filter.attribute === "externalId" ? "external_id" : "id";
      where.push(`${column} = ?${values.length}`);
    }
    const countRow = await this.prepare(
      `select count(*) as total from own_auth_scim_users where ${where.join(" and ")}`,
      values
    ).first<{ total: number }>();
    values.push(count, startIndex - 1);
    const rows = await this.prepare(
      `select ${scimUserReturning} from own_auth_scim_users where ${where.join(" and ")} ` +
      `order by created_at asc, id asc limit ?${values.length - 1} offset ?${values.length}`,
      values
    ).all<DatabaseRow>();
    return {
      users: (rows.results ?? []).map(mapScimUser),
      totalResults: Number(countRow?.total ?? 0)
    };
  }

  async listUsersByOrganisationAndUser(organisationId: string, userId: string): Promise<ScimUser[]> {
    const selected = scimUserReturning.split(", ").map((column) => `u.${column}`).join(", ");
    const rows = await this.selectMany(
      `${selected} from own_auth_scim_users u ` +
      "join own_auth_scim_connections c on c.id = u.connection_id " +
      "where c.organisation_id = ?1 and u.user_id = ?2", [organisationId, userId]
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
      "where c.saml_connection_id = ?1 and c.disabled_at is null " +
      "and u.normalized_email = ?2 and u.active = 1 and u.deleted_at is null limit 2",
      [samlConnectionId, normalizedEmail]
    );
    return rows.length === 1 ? mapScimUser(rows[0]!) : null;
  }

  async commitProvision(input: ScimProvisionCommit): Promise<void> {
    const statements: D1PreparedStatementLike[] = [];
    if (input.user) {
      statements.push(this.insertStatement("own_auth_users", userColumns, input.user, "id"));
    }
    statements.push(this.insertStatement(
      "own_auth_organisation_members", organisationMemberColumns, input.membership, "id"
    ));
    statements.push(this.insertStatement(
      "own_auth_scim_users", scimUserColumns, input.scimUser, "id"
    ));
    for (const event of input.auditEvents) {
      statements.push(this.insertStatement("own_auth_audit_events", auditEventColumns, event, "id"));
    }
    await this.db.batch(statements);
  }

  async mutateUser(input: ScimUserMutation): Promise<ScimUser | null> {
    const statements: D1PreparedStatementLike[] = [];
    const memberEntries = databaseColumnEntries(organisationMemberColumns, input.membershipPatch ?? {})
      .filter(([key]) => !["id", "organisationId", "userId", "role", "createdAt"].includes(key));
    const memberDependency = memberEntries.length > 0
      ? "and exists (select 1 from own_auth_organisation_members " +
        "where id = own_auth_scim_users.membership_id) "
      : "";
    if (input.auditEvent) {
      const entries = databaseColumnEntries(auditEventColumns, input.auditEvent);
      const values = entries.map(([key]) => input.auditEvent?.[key]);
      statements.push(this.prepare(
        `insert into own_auth_audit_events (${entries.map(([, column]) => column).join(", ")}) ` +
        `select ${values.map((_, index) => `?${index + 1}`).join(", ")} ` +
        `where exists (select 1 from own_auth_scim_users where id = ?${values.length + 1} ` +
        `and version = ?${values.length + 2} ${memberDependency}) returning id`,
        [...values, input.id, input.expectedVersion]
      ));
    }
    if (memberEntries.length > 0) {
      const memberValues = memberEntries.map(([key]) => input.membershipPatch?.[key]);
      statements.push(this.prepare(
        "update own_auth_organisation_members set " +
        memberEntries.map(([, column], index) => `${column} = ?${index + 1}`).join(", ") +
        ` where id = (select membership_id from own_auth_scim_users ` +
        `where id = ?${memberValues.length + 1} and version = ?${memberValues.length + 2})`,
        [...memberValues, input.id, input.expectedVersion]
      ));
    }
    const userEntries = databaseColumnEntries(scimUserColumns, input.patch)
      .filter(([key]) => ![
        "id", "connectionId", "userId", "membershipId", "version", "createdAt"
      ].includes(key));
    const userValues = userEntries.map(([key]) => input.patch[key]);
    statements.push(this.prepare(
      "update own_auth_scim_users set " +
      userEntries.map(([, column], index) => `${column} = ?${index + 1}`).join(", ") +
      `${userEntries.length > 0 ? ", " : ""}version = version + 1 ` +
      `where id = ?${userValues.length + 1} and version = ?${userValues.length + 2} ` +
      memberDependency +
      `returning ${scimUserReturning}`,
      [...userValues, input.id, input.expectedVersion]
    ));
    const results = await this.db.batch<DatabaseRow>(statements);
    const row = results.at(-1)?.results?.[0];
    return row ? mapScimUser(row) : null;
  }

  async verifyPairedSamlEmail(input: ScimEmailVerificationCommit): Promise<boolean> {
    const entries = databaseColumnEntries(auditEventColumns, input.auditEvent);
    const auditValues = entries.map(([key]) => input.auditEvent[key]);
    const insertAudit = this.prepare(
      `insert into own_auth_audit_events (${entries.map(([, column]) => column).join(", ")}) ` +
      `select ${auditValues.map((_, index) => `?${index + 1}`).join(", ")} ` +
      `where exists (select 1 from own_auth_users where id = ?${auditValues.length + 1} ` +
      `and email = ?${auditValues.length + 2} and email_verified_at is null) returning id`,
      [...auditValues, input.userId, input.normalizedEmail]
    );
    const verify = this.prepare(
      "update own_auth_users set email_verified_at = ?3, updated_at = ?3 " +
      "where id = ?1 and email = ?2 and email_verified_at is null returning id",
      [input.userId, input.normalizedEmail, input.verifiedAt]
    );
    const results = await this.db.batch<DatabaseRow>([insertAudit, verify]);
    return (results[1]?.results?.length ?? 0) === 1;
  }
}
