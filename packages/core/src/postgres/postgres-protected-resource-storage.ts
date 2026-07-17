import {
  mapProtectedResource,
  mapProtectedResourceSecret
} from "../authorization-server-database-mappers.js";
import {
  protectedResourceReturning,
  protectedResourceSecretReturning
} from "../authorization-server-database-schema.js";
import type {
  ProtectedResource,
  ProtectedResourceSecret
} from "../authorization-server-types.js";
import { expectOne } from "./postgres-row.js";
import { PostgresStorageBase } from "./postgres-storage-base.js";
import type { Row } from "./postgres-types.js";

export class PostgresProtectedResourceStorage extends PostgresStorageBase {
  async createProtectedResource(
    resource: ProtectedResource,
    secret: ProtectedResourceSecret
  ): Promise<ProtectedResource> {
    const result = await this.db.query<Row>(
      `with inserted_resource as (
         insert into own_auth_protected_resources
           (id, identifier, name, allowed_scopes, status, created_at, updated_at, revoked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning ${protectedResourceReturning}
       ), inserted_secret as (
         insert into own_auth_protected_resource_secrets
           (id, protected_resource_id, prefix, secret_hash, created_at, expires_at, revoked_at)
         values ($9,$10,$11,$12,$13,$14,$15)
       )
       select ${protectedResourceReturning} from inserted_resource`,
      [
        resource.id,
        resource.identifier,
        resource.name,
        resource.allowedScopes,
        resource.status,
        resource.createdAt,
        resource.updatedAt,
        resource.revokedAt,
        secret.id,
        secret.protectedResourceId,
        secret.prefix,
        secret.secretHash,
        secret.createdAt,
        secret.expiresAt,
        secret.revokedAt
      ]
    );
    return mapProtectedResource(expectOne(result.rows));
  }

  async getProtectedResourceById(id: string): Promise<ProtectedResource | null> {
    const row = await this.selectOne(
      `${protectedResourceReturning} from own_auth_protected_resources where id = $1`,
      [id]
    );
    return row ? mapProtectedResource(row) : null;
  }

  async getProtectedResourceByIdentifier(
    identifier: string
  ): Promise<ProtectedResource | null> {
    const row = await this.selectOne(
      `${protectedResourceReturning}
       from own_auth_protected_resources where identifier = $1`,
      [identifier]
    );
    return row ? mapProtectedResource(row) : null;
  }

  async listProtectedResources(): Promise<ProtectedResource[]> {
    return (await this.selectMany(
      `${protectedResourceReturning} from own_auth_protected_resources
       order by created_at desc, id desc`,
      []
    )).map(mapProtectedResource);
  }

  async updateProtectedResource(
    id: string,
    patch: Partial<ProtectedResource>
  ): Promise<ProtectedResource | null> {
    const updatedAt = patch.updatedAt ?? new Date();
    const allowedScopes = patch.allowedScopes ?? null;
    const result = await this.db.query<Row>(
      `with updated_resource as (
         update own_auth_protected_resources
         set name = coalesce($2, name),
             allowed_scopes = coalesce($3::text[], allowed_scopes),
             updated_at = $4
         where id = $1
         returning ${protectedResourceReturning}
       ), adjusted_grants as (
         update own_auth_authorization_grants
         set scopes = array(
               select existing_scope
               from unnest(scopes) as existing_scope
               where existing_scope = any($3::text[])
             ),
             updated_at = $4
         where protected_resource_id = $1 and revoked_at is null
           and $3::text[] is not null and not (scopes <@ $3::text[])
       ), revoked_access as (
         update own_auth_authorization_access_tokens
         set revoked_at = $4
         where protected_resource_id = $1 and revoked_at is null
           and $3::text[] is not null and not (scopes <@ $3::text[])
       ), revoked_refresh as (
         update own_auth_authorization_refresh_tokens
         set revoked_at = $4
         where protected_resource_id = $1 and revoked_at is null
           and $3::text[] is not null and not (scopes <@ $3::text[])
       )
       select ${protectedResourceReturning} from updated_resource`,
      [id, patch.name ?? null, allowedScopes, updatedAt]
    );
    return result.rows[0] ? mapProtectedResource(result.rows[0]) : null;
  }

  async replaceProtectedResourceSecret(
    protectedResourceId: string,
    secret: ProtectedResourceSecret,
    revokedAt: Date
  ): Promise<ProtectedResourceSecret> {
    const result = await this.db.query<Row>(
      `with revoked as (
         update own_auth_protected_resource_secrets
         set revoked_at = $2
         where protected_resource_id = $1 and revoked_at is null
       )
       insert into own_auth_protected_resource_secrets
         (id, protected_resource_id, prefix, secret_hash, created_at, expires_at, revoked_at)
       values ($3,$1,$4,$5,$6,$7,null)
       returning ${protectedResourceSecretReturning}`,
      [
        protectedResourceId,
        revokedAt,
        secret.id,
        secret.prefix,
        secret.secretHash,
        secret.createdAt,
        secret.expiresAt
      ]
    );
    return mapProtectedResourceSecret(expectOne(result.rows));
  }

  async getProtectedResourceSecretByPrefix(
    protectedResourceId: string,
    prefix: string
  ): Promise<ProtectedResourceSecret | null> {
    const row = await this.selectOne(
      `${protectedResourceSecretReturning}
       from own_auth_protected_resource_secrets
       where protected_resource_id = $1 and prefix = $2
         and revoked_at is null and (expires_at is null or expires_at > now())`,
      [protectedResourceId, prefix]
    );
    return row ? mapProtectedResourceSecret(row) : null;
  }

  async revokeProtectedResource(
    id: string,
    revokedAt: Date
  ): Promise<ProtectedResource | null> {
    const result = await this.db.query<Row>(
      `with revoked_resource as (
         update own_auth_protected_resources
         set status = 'revoked', revoked_at = $2, updated_at = $2
         where id = $1
         returning ${protectedResourceReturning}
       ), revoked_secrets as (
         update own_auth_protected_resource_secrets set revoked_at = $2
         where protected_resource_id = $1 and revoked_at is null
       ), revoked_grants as (
         update own_auth_authorization_grants set revoked_at = $2, updated_at = $2
         where protected_resource_id = $1 and revoked_at is null
       ), revoked_access as (
         update own_auth_authorization_access_tokens set revoked_at = $2
         where protected_resource_id = $1 and revoked_at is null
       ), revoked_refresh as (
         update own_auth_authorization_refresh_tokens set revoked_at = $2
         where protected_resource_id = $1 and revoked_at is null
       )
       select ${protectedResourceReturning} from revoked_resource`,
      [id, revokedAt]
    );
    return result.rows[0] ? mapProtectedResource(result.rows[0]) : null;
  }
}
