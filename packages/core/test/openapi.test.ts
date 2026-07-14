import { describe, expect, it } from "vitest";
import {
  createConfiguredOwnAuthOpenApiDocument,
  createOwnAuthOpenApiDocument,
  defineOwnAuthPlugin,
  ownAuthEndpointContract
} from "../src/index.js";

describe("Own Auth OpenAPI", () => {
  it("generates every route from the shared endpoint contract", () => {
    const document = createOwnAuthOpenApiDocument({
      basePath: "/auth",
      serverUrl: "https://api.example.com",
      version: "0.1.0"
    });

    const operationCount = Object.values(document.paths).reduce(
      (count, path) => count + Object.keys(path).filter(
        (method) => method === "get" || method === "post"
      ).length,
      0
    );
    expect(operationCount).toBe(ownAuthEndpointContract.length);
    expect(document.servers).toEqual([{ url: "https://api.example.com" }]);

    for (const endpoint of ownAuthEndpointContract) {
      const operation = document.paths[`/auth${endpoint.path}`]?.[
        endpoint.method.toLowerCase()
      ] as Record<string, unknown> | undefined;
      expect(operation?.operationId).toBe(endpoint.id);
      expect(operation?.["x-own-auth-errors"]).toEqual(endpoint.errors);
    }
  });

  it("keeps Apple GET and form-post callbacks as separate operations", () => {
    const document = createOwnAuthOpenApiDocument();
    const callbacks = document.paths["/api/auth/oauth/apple/callback"] as {
      get?: { operationId?: string };
      post?: {
        operationId?: string;
        requestBody?: { content?: Record<string, unknown> };
        responses?: Record<string, unknown>;
      };
    };

    expect(callbacks.get?.operationId).toBe("oauthAppleCallback");
    expect(callbacks.post?.operationId).toBe("oauthAppleCallbackPost");
    expect(callbacks.post?.requestBody?.content).toHaveProperty(
      "application/x-www-form-urlencoded"
    );
    expect(callbacks.post?.responses).toHaveProperty("413");
    expect(callbacks.post?.responses).toHaveProperty("415");
    expect(callbacks.post?.responses).not.toHaveProperty("502");
  });

  it("keeps core OpenAPI stable and adds configured plugins only to the dynamic document", () => {
    const plugin = defineOwnAuthPlugin({
      id: "profile",
      version: "1.0.0",
      endpoints: [{
        id: "read",
        method: "GET",
        path: "/read",
        summary: "Read the profile",
        output: { type: "object", additionalProperties: false },
        handler: () => ({})
      }]
    });
    const core = createOwnAuthOpenApiDocument();
    const configured = createConfiguredOwnAuthOpenApiDocument([plugin]);

    expect(core.paths).not.toHaveProperty("/api/auth/plugins/profile/read");
    expect(configured.paths).toHaveProperty("/api/auth/plugins/profile/read");
    expect(configured["x-own-auth-plugin-fingerprint"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the contract request and response schemas without a second definition", () => {
    const endpoint = ownAuthEndpointContract.find(
      (candidate) => candidate.id === "signInEmailPassword"
    );
    const document = createOwnAuthOpenApiDocument();
    const operation = document.paths["/api/auth/sign-in/email"]?.post as {
      requestBody?: { content: { "application/json": { schema: unknown } } };
      responses?: { "200": { content: { "application/json": { schema: unknown } } } };
    };

    expect(operation.requestBody?.content["application/json"].schema).toBe(endpoint?.request);
    expect(operation.responses?.["200"].content["application/json"].schema).toBe(
      endpoint?.response
    );
  });
});
