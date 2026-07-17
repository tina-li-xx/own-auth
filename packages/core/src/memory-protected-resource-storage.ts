import type {
  ProtectedResource,
  ProtectedResourceSecret
} from "./authorization-server-types.js";
import {
  cloneStored,
  findStored,
  updateStoredEntity,
  updateStoredWhere
} from "./memory-storage-helpers.js";

export abstract class MemoryProtectedResourceStorage {
  private readonly protectedResources = new Map<string, ProtectedResource>();
  private readonly protectedResourceSecrets = new Map<string, ProtectedResourceSecret>();

  async createProtectedResource(
    resource: ProtectedResource,
    secret: ProtectedResourceSecret
  ): Promise<ProtectedResource> {
    if (this.findProtectedResourceByIdentifier(resource.identifier)) {
      throw new Error("Protected resource already exists");
    }
    this.protectedResources.set(resource.id, cloneStored(resource));
    this.protectedResourceSecrets.set(secret.id, cloneStored(secret));
    return cloneStored(resource);
  }

  async getProtectedResourceById(id: string): Promise<ProtectedResource | null> {
    const resource = this.protectedResources.get(id);
    return resource ? cloneStored(resource) : null;
  }

  async getProtectedResourceByIdentifier(
    identifier: string
  ): Promise<ProtectedResource | null> {
    const resource = this.findProtectedResourceByIdentifier(identifier);
    return resource ? cloneStored(resource) : null;
  }

  async listProtectedResources(): Promise<ProtectedResource[]> {
    return [...this.protectedResources.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(cloneStored);
  }

  async updateProtectedResource(
    id: string,
    patch: Partial<ProtectedResource>
  ): Promise<ProtectedResource | null> {
    if (!this.protectedResources.has(id)) return null;
    if (patch.allowedScopes) {
      this.onProtectedResourceScopesChanged(
        id,
        patch.allowedScopes,
        patch.updatedAt ?? new Date()
      );
    }
    return updateStoredEntity(this.protectedResources, id, patch);
  }

  async replaceProtectedResourceSecret(
    protectedResourceId: string,
    secret: ProtectedResourceSecret,
    revokedAt: Date
  ): Promise<ProtectedResourceSecret> {
    updateStoredWhere(
      this.protectedResourceSecrets,
      (existing) =>
        existing.protectedResourceId === protectedResourceId && !existing.revokedAt,
      { revokedAt }
    );
    this.protectedResourceSecrets.set(secret.id, cloneStored(secret));
    return cloneStored(secret);
  }

  async getProtectedResourceSecretByPrefix(
    protectedResourceId: string,
    prefix: string
  ): Promise<ProtectedResourceSecret | null> {
    const now = Date.now();
    return findStored(
      this.protectedResourceSecrets,
      (secret) =>
        secret.protectedResourceId === protectedResourceId &&
        secret.prefix === prefix &&
        !secret.revokedAt &&
        (!secret.expiresAt || secret.expiresAt.getTime() > now)
    );
  }

  async revokeProtectedResource(
    id: string,
    revokedAt: Date
  ): Promise<ProtectedResource | null> {
    if (!this.protectedResources.has(id)) return null;
    updateStoredWhere(
      this.protectedResourceSecrets,
      (secret) => secret.protectedResourceId === id && !secret.revokedAt,
      { revokedAt }
    );
    this.onProtectedResourceRevoked(id, revokedAt);
    return updateStoredEntity(this.protectedResources, id, {
      status: "revoked",
      revokedAt,
      updatedAt: revokedAt
    });
  }

  protected findProtectedResourceByIdentifier(
    identifier: string
  ): ProtectedResource | null {
    return [...this.protectedResources.values()].find(
      (resource) => resource.identifier === identifier
    ) ?? null;
  }

  protected abstract onProtectedResourceScopesChanged(
    protectedResourceId: string,
    allowedScopes: readonly string[],
    changedAt: Date
  ): void;

  protected abstract onProtectedResourceRevoked(
    protectedResourceId: string,
    revokedAt: Date
  ): void;
}
