import { describe, expect, it } from "vitest";
import {
  createOwnAuthAuthorizationServerOpenApiDocument
} from "../src/authorization-server-openapi.js";

describe("authorization-server OpenAPI", () => {
  it("documents the DPoP authorization, token, resource, and userinfo contracts", () => {
    const document = createOwnAuthAuthorizationServerOpenApiDocument({
      serverUrl: "https://auth.example.com"
    });
    const token = document.paths["/oauth/token"]?.post as Record<string, unknown>;
    const authorize = document.paths["/oauth/authorize"]?.get as Record<string, unknown>;
    const userInfo = document.paths["/oauth/userinfo"]?.get as Record<string, unknown>;
    const schemas = (document.components.schemas ?? {}) as Record<string, unknown>;

    expect(document.servers).toEqual([{ url: "https://auth.example.com" }]);
    expect(authorize.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "dpop_jkt", in: "query" })
    ]));
    expect(token.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "DPoP", in: "header" })
    ]));
    expect(userInfo.security).toEqual(expect.arrayContaining([
      { dpopToken: [], dpopProof: [] }
    ]));
    expect(schemas.TokenResponse).toMatchObject({
      properties: {
        token_type: { enum: ["Bearer", "DPoP"] }
      }
    });
    expect(schemas.IntrospectionResponse).toMatchObject({
      properties: {
        cnf: { properties: { jkt: { type: "string" } } }
      }
    });
  });
});
