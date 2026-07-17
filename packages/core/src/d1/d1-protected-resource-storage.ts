import {
  mapProtectedResource,
  mapProtectedResourceSecret
} from "../authorization-server-database-mappers.js";
import {
  protectedResourceColumns,
  protectedResourceReturning,
  protectedResourceSecretColumns,
  protectedResourceSecretReturning
} from "../authorization-server-database-schema.js";
import type {
  ProtectedResource,
  ProtectedResourceSecret
} from "../authorization-server-types.js";
import { expectDatabaseValue } from "../database-row.js";
import type { DatabaseRow } from "../database-types.js";
import { D1StorageBase } from "./d1-storage-base.js";

export class D1ProtectedResourceStorage extends D1StorageBase {
  async createProtectedResource(
    resource: ProtectedResource,
    secret: ProtectedResourceSecret
  ): Promise<ProtectedResource> {
    const results = await this.db.batch<DatabaseRow>([
      this.insertStatement(
        "own_auth_protected_resources",
        protectedResourceColumns,
        resource,
        protectedResourceReturning
      ),
      this.insertStatement(
        "own_auth_protected_resource_secrets",
        protectedResourceSecretColumns,
        secret,
        protectedResourceSecretReturning
      )
    ]);
    return mapProtectedResource(expectDatabaseValue(
      results[0]?.results?.[0],
      "D1 protected resource creation"
    ));
  }

  async getProtectedResourceById(id: string): Promise<ProtectedResource | null> {
    const row = await this.selectOne(
      `${protectedResourceReturning} from own_auth_protected_resources where id = ?1`,
      [id]
    );
    return row ? mapProtectedResource(row) : null;
  }

  async getProtectedResourceByIdentifier(
    identifier: string
  ): Promise<ProtectedResource | null> {
    const row = await this.selectOne(
      `${protectedResourceReturning}
       from own_auth_protected_resources where identifier = ?1`,
      [identifier]
    );
    return row ? mapProtectedResource(row) : null;
  }

  async listProtectedResources(): Promise<ProtectedResource[]> {
    return (await this.selectMany(
      `${protectedResourceReturning} from own_auth_protected_resources
       order by created_at desc, id desc`
    )).map(mapProtectedResource);
  }

  async updateProtectedResource(
    id: string,
    patch: Partial<ProtectedResource>
  ): Promise<ProtectedResource | null> {
    const updatedAt = patch.updatedAt ?? new Date();
    const allowedScopes = patch.allowedScopes ?? null;
    const invalidScope = `exists (
      select 1 from json_each(scopes) token_scope
      where token_scope.value not in (select value from json_each(?2))
    )`;
    const results = await this.db.batch<DatabaseRow>([
      this.prepare(
        `update own_auth_protected_resources
         set name = coalesce(?2, name),
             allowed_scopes = coalesce(?3, allowed_scopes),
             updated_at = ?4
         where id = ?1 returning ${protectedResourceReturning}`,
        [id, patch.name ?? null, allowedScopes, updatedAt]
      ),
      this.prepare(
        `update own_auth_authorization_grants
         set scopes = (
               select coalesce(json_group_array(existing_scope.value), '[]')
               from json_each(scopes) existing_scope
               where existing_scope.value in (select value from json_each(?2))
             ),
             updated_at = ?3
         where protected_resource_id = ?1 and revoked_at is null
           and ?2 is not null and ${invalidScope}`,
        [id, allowedScopes, updatedAt]
      ),
      this.revokeTokensOutsideScopes(
        "own_auth_authorization_access_tokens",
        id,
        allowedScopes,
        updatedAt,
        invalidScope
      ),
      this.revokeTokensOutsideScopes(
        "own_auth_authorization_refresh_tokens",
        id,
        allowedScopes,
        updatedAt,
        invalidScope
      )
    ]);
    const row = results[0]?.results?.[0];
    return row ? mapProtectedResource(row) : null;
  }

  async replaceProtectedResourceSecret(
    protectedResourceId: string,
    secret: ProtectedResourceSecret,
    revokedAt: Date
  ): Promise<ProtectedResourceSecret> {
    const results = await this.db.batch<DatabaseRow>([
      this.prepare(
        `update own_auth_protected_resource_secrets set revoked_at = ?2
         where protected_resource_id = ?1 and revoked_at is null`,
        [protectedResourceId, revokedAt]
      ),
      this.insertStatement(
        "own_auth_protected_resource_secrets",
        protectedResourceSecretColumns,
        secret,
        protectedResourceSecretReturning
      )
    ]);
    return mapProtectedResourceSecret(expectDatabaseValue(
      results[1]?.results?.[0],
      "D1 protected resource secret rotation"
    ));
  }

  async getProtectedResourceSecretByPrefix(
    protectedResourceId: string,
    prefix: string
  ): Promise<ProtectedResourceSecret | null> {
    const row = await this.selectOne(
      `${protectedResourceSecretReturning}
       from own_auth_protected_resource_secrets
       where protected_resource_id = ?1 and prefix = ?2
         and revoked_at is null and (expires_at is null or expires_at > ?3)`,
      [protectedResourceId, prefix, Date.now()]
    );
    return row ? mapProtectedResourceSecret(row) : null;
  }

  async revokeProtectedResource(
    id: string,
    revokedAt: Date
  ): Promise<ProtectedResource | null> {
    const results = await this.db.batch<DatabaseRow>([
      this.prepare(
        `update own_auth_protected_resources
         set status = 'revoked', revoked_at = ?2, updated_at = ?2
         where id = ?1 returning ${protectedResourceReturning}`,
        [id, revokedAt]
      ),
      this.prepare(
        `update own_auth_protected_resource_secrets set revoked_at = ?2
         where protected_resource_id = ?1 and revoked_at is null`,
        [id, revokedAt]
      ),
      this.prepare(
        `update own_auth_authorization_grants set revoked_at = ?2, updated_at = ?2
         where protected_resource_id = ?1 and revoked_at is null`,
        [id, revokedAt]
      ),
      this.prepare(
        `update own_auth_authorization_access_tokens set revoked_at = ?2
         where protected_resource_id = ?1 and revoked_at is null`,
        [id, revokedAt]
      ),
      this.prepare(
        `update own_auth_authorization_refresh_tokens set revoked_at = ?2
         where protected_resource_id = ?1 and revoked_at is null`,
        [id, revokedAt]
      )
    ]);
    const row = results[0]?.results?.[0];
    return row ? mapProtectedResource(row) : null;
  }

  private revokeTokensOutsideScopes(
    table: "own_auth_authorization_access_tokens" | "own_auth_authorization_refresh_tokens",
    protectedResourceId: string,
    allowedScopes: string[] | null,
    revokedAt: Date,
    invalidScope: string
  ) {
    return this.prepare(
      `update ${table} set revoked_at = ?3
       where protected_resource_id = ?1 and revoked_at is null
         and ?2 is not null and ${invalidScope}`,
      [protectedResourceId, allowedScopes, revokedAt]
    );
  }
}
