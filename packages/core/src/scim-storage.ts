import type { AuthStorage } from "./storage.js";
import type {
  ScimConnection,
  ScimEmailVerificationCommit,
  ScimProvisionCommit,
  ScimToken,
  ScimUser,
  ScimUserFilter,
  ScimUserMutation,
  ScimUserPage
} from "./scim-types.js";

export interface ScimStorage {
  createConnection(connection: ScimConnection): Promise<ScimConnection>;
  getConnectionById(id: string): Promise<ScimConnection | null>;
  listConnectionsByOrganisationId(organisationId: string): Promise<ScimConnection[]>;
  updateConnection(id: string, patch: Partial<ScimConnection>): Promise<ScimConnection | null>;

  createToken(token: ScimToken): Promise<ScimToken>;
  getTokenById(id: string): Promise<ScimToken | null>;
  getTokenByHash(tokenHash: string): Promise<ScimToken | null>;
  listTokensByConnectionId(connectionId: string): Promise<ScimToken[]>;
  updateToken(id: string, patch: Partial<ScimToken>): Promise<ScimToken | null>;

  getUserById(id: string): Promise<ScimUser | null>;
  getUserByExternalId(connectionId: string, externalId: string): Promise<ScimUser | null>;
  getUserByUserName(connectionId: string, normalizedUserName: string): Promise<ScimUser | null>;
  getActiveUserByEmail(connectionId: string, normalizedEmail: string): Promise<ScimUser | null>;
  listUsers(
    connectionId: string,
    filter: ScimUserFilter | null,
    startIndex: number,
    count: number
  ): Promise<ScimUserPage>;
  listUsersByOrganisationAndUser(organisationId: string, userId: string): Promise<ScimUser[]>;
  findActiveUserBySamlConnection(
    samlConnectionId: string,
    normalizedEmail: string
  ): Promise<ScimUser | null>;
  commitProvision(input: ScimProvisionCommit): Promise<void>;
  mutateUser(input: ScimUserMutation): Promise<ScimUser | null>;
  verifyPairedSamlEmail(input: ScimEmailVerificationCommit): Promise<boolean>;
}

export interface ScimCapableStorage extends AuthStorage {
  readonly scimStorage: ScimStorage;
}

export function isScimCapableStorage(storage: AuthStorage): storage is ScimCapableStorage {
  const candidate = (storage as Partial<ScimCapableStorage>).scimStorage;
  return Boolean(candidate) && [
    "createConnection",
    "getConnectionById",
    "listConnectionsByOrganisationId",
    "updateConnection",
    "createToken",
    "getTokenById",
    "getTokenByHash",
    "listTokensByConnectionId",
    "updateToken",
    "getUserById",
    "getUserByExternalId",
    "getUserByUserName",
    "getActiveUserByEmail",
    "listUsers",
    "listUsersByOrganisationAndUser",
    "findActiveUserBySamlConnection",
    "commitProvision",
    "mutateUser",
    "verifyPairedSamlEmail"
  ].every((method) => typeof candidate?.[method as keyof ScimStorage] === "function");
}
