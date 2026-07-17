import { describe, expect, it, vi } from "vitest";
import {
  createBearerChallenge,
  createOwnAuthProtectedResource,
  OwnAuthProtectedResourceError
} from "../src/protected-resource.js";

const resource = "https://api.example.com/";

describe("protected resource client", () => {
  it("returns insufficient_scope without reducing an active token", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      active: true,
      aud: resource,
      client_id: "oa_client_example",
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      scope: "documents:read",
      sub: "oa_sub_example",
      token_type: "Bearer"
    }));
    const client = createOwnAuthProtectedResource({
      introspectionUrl: "https://auth.example.com/oauth/introspect",
      resource,
      resourceSecret: "oa_rs_example_secret",
      fetch
    });

    await expect(client.verifyAccessToken({
      accessToken: "oa_at_example",
      requiredScopes: ["documents:write"]
    })).resolves.toEqual({
      active: false,
      error: "insufficient_scope",
      requiredScopes: ["documents:write"]
    });
    const request = fetch.mock.calls[0]?.[1];
    expect(request?.headers).toEqual(expect.objectContaining({
      authorization: expect.stringMatching(/^Basic /)
    }));
    expect(JSON.stringify(request?.headers)).not.toContain("oa_at_example");
    expect(String(request?.body)).toContain("token=oa_at_example");
  });

  it("creates RFC 6750 Bearer challenges", () => {
    expect(createBearerChallenge({
      realm: "Documents API",
      error: "insufficient_scope",
      requiredScopes: ["documents:write"]
    })).toBe(
      'Bearer realm="Documents API", error="insufficient_scope", ' +
      'error_description="The access token does not include the required scope", ' +
      'scope="documents:write"'
    );
  });

  it("rejects malformed introspection responses without exposing response data", async () => {
    const client = createOwnAuthProtectedResource({
      introspectionUrl: "https://auth.example.com/oauth/introspect",
      resource,
      resourceSecret: "oa_rs_example_secret",
      fetch: async () => Response.json({ active: true, token: "secret-response-value" })
    });

    const error = await client.verifyAccessToken({ accessToken: "oa_at_example" })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OwnAuthProtectedResourceError);
    expect(error).toMatchObject({ code: "invalid_introspection_response" });
    expect(String(error)).not.toContain("secret-response-value");
  });
});
