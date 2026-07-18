import {
  createOwnAuth,
  InMemoryAuthStorage,
  type PublicScimConnection,
  type ScimCapableStorage
} from "../../src/index.js";
import {
  createOwnAuthScimHandler,
  createOwnAuthScimOpenApiDocument,
  type OwnAuthScimHandler
} from "../../src/scim-http.js";

const storage: ScimCapableStorage = new InMemoryAuthStorage();

export const scimAuth = createOwnAuth({
  storage,
  tokenPepper: "scim-type-contract-pepper",
  scim: {}
});

export const scimConnection: Promise<PublicScimConnection> =
  scimAuth.scim.createConnection({
    organisationId: "org_example",
    actorUserId: "usr_owner",
    name: "Example provisioning"
  });

export const scimHandler: OwnAuthScimHandler = createOwnAuthScimHandler(scimAuth);
export const scimOpenApi = createOwnAuthScimOpenApiDocument();

scimAuth.scim.restoreUser({
  connectionId: "scimc_example",
  actorUserId: "usr_owner",
  scimUserId: "scimu_example"
});

scimAuth.scim.createConnection({
  organisationId: "org_example",
  actorUserId: "usr_owner",
  name: "Invalid linking",
  // @ts-expect-error SCIM supports only explicit or verified-email linking.
  accountLinking: "automatic"
});
