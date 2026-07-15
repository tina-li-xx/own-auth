import {
  InMemoryAuthStorage,
  createOwnAuth,
  defineOwnAuthAuthorization
} from "../../src/index.js";

export const customAuthorization = defineOwnAuthAuthorization({
  permissions: ["documents:read", "documents:write"],
  roles: {
    reviewer: ["view_members", "documents:read"],
    editor: ["view_members", "documents:read", "documents:write"]
  }
});

export const configuredAuth = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "type-contract-pepper",
  authorization: customAuthorization
});

export const inlineConfiguredAuth = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "inline-type-contract-pepper",
  authorization: {
    permissions: ["reports:read"],
    roles: {
      analyst: ["view_members", "reports:read"]
    }
  }
});
