import { describe, expect, it } from "vitest";
import {
  createOwnAuthOpenApiDocument,
  ownAuthEndpointContract
} from "../src/http/index.js";

describe("Own Auth OpenAPI", () => {
  it("generates every route from the shared endpoint contract", () => {
    const document = createOwnAuthOpenApiDocument({
      basePath: "/auth",
      serverUrl: "https://api.example.com",
      version: "0.1.0"
    });

    expect(Object.keys(document.paths)).toHaveLength(ownAuthEndpointContract.length);
    expect(document.servers).toEqual([{ url: "https://api.example.com" }]);

    for (const endpoint of ownAuthEndpointContract) {
      const operation = document.paths[`/auth${endpoint.path}`]?.[
        endpoint.method.toLowerCase()
      ] as Record<string, unknown> | undefined;
      expect(operation?.operationId).toBe(endpoint.id);
      expect(operation?.["x-own-auth-errors"]).toEqual(endpoint.errors);
    }
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
