import { describe, expect, it } from "vitest";
import {
  createConfiguredOwnAuthOpenApiDocument,
  getOwnAuthEndpoint,
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
    const publicEndpoints = ownAuthEndpointContract.filter(
      ({ feature }) => feature !== "administration"
    );
    expect(operationCount).toBe(publicEndpoints.length);
    expect(document.servers).toEqual([{ url: "https://api.example.com" }]);

    for (const endpoint of publicEndpoints) {
      const operation = document.paths[`/auth${endpoint.path}`]?.[
        endpoint.method.toLowerCase()
      ] as Record<string, unknown> | undefined;
      expect(operation?.operationId).toBe(endpoint.id);
      expect(operation?.["x-own-auth-errors"]).toEqual(endpoint.errors);
    }
  });

  it("includes administration operations only when explicitly requested", () => {
    const core = createOwnAuthOpenApiDocument();
    const configured = createOwnAuthOpenApiDocument({ includeAdministration: true });

    expect(core.paths).not.toHaveProperty("/api/auth/admin/users");
    expect(configured.paths["/api/auth/admin/users"]?.get).toMatchObject({
      operationId: "adminListUsers",
      security: [{ sessionCookie: [] }, { bearerSession: [] }]
    });
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

  it("exposes configured invitation roles as validated strings", () => {
    const endpoint = getOwnAuthEndpoint("acceptInvite");
    const response = endpoint.response as {
      properties: {
        member: { properties: { role: Record<string, unknown> } };
      };
    };
    const document = createOwnAuthOpenApiDocument();
    const operation = document.paths["/api/auth/invitations/accept"]?.post as {
      responses?: Record<string, unknown>;
    };

    expect(response.properties.member.properties.role).toEqual({
      type: "string",
      pattern: "^[a-z][a-z0-9_-]{0,63}$"
    });
    expect(endpoint.errors).toContain("role_not_configured");
    expect(operation.responses).toHaveProperty("409");
  });

  it("owns and deeply freezes the endpoint contract", () => {
    const endpoint = getOwnAuthEndpoint("signInEmailPassword");
    const request = endpoint.request as {
      properties: { email: { type: string } };
    };

    expect(new Set(ownAuthEndpointContract.map(({ id }) => id)).size).toBe(
      ownAuthEndpointContract.length
    );
    expect(Object.isFrozen(ownAuthEndpointContract)).toBe(true);
    expect(Object.isFrozen(endpoint)).toBe(true);
    expect(Object.isFrozen(request.properties)).toBe(true);
    expect(Object.isFrozen(request.properties.email)).toBe(true);
    expect(Reflect.set(endpoint, "path", "/changed")).toBe(false);
    expect(Reflect.set(request.properties.email, "type", "number")).toBe(false);
    expect(getOwnAuthEndpoint("signInEmailPassword").path).toBe("/sign-in/email");
  });
});
