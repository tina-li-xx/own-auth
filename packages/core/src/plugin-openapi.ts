import {
  createOwnAuthOpenApiDocument,
  queryParametersForSchema,
  type OwnAuthOpenApiDocument,
  type OwnAuthOpenApiOptions
} from "./http/openapi.js";
import { normalizeOwnAuthBasePath } from "./http/routing.js";
import { createOwnAuthPluginContractFingerprint } from "./plugin-contract.js";
import { pluginEndpointPath, validatePluginSet } from "./plugin-definition.js";
import type { OwnAuthPluginDefinition } from "./plugin-types.js";
import { OWN_AUTH_VERSION } from "./version.js";

export interface OwnAuthConfiguredOpenApiOptions extends OwnAuthOpenApiOptions {
  coreVersion?: string;
}

export interface OwnAuthConfiguredOpenApiDocument extends OwnAuthOpenApiDocument {
  "x-own-auth-plugin-fingerprint": string;
}

export function createConfiguredOwnAuthOpenApiDocument(
  plugins: readonly OwnAuthPluginDefinition[],
  options: OwnAuthConfiguredOpenApiOptions = {}
): OwnAuthConfiguredOpenApiDocument {
  validatePluginSet(plugins);
  const coreVersion = options.coreVersion ?? OWN_AUTH_VERSION;
  const document = createOwnAuthOpenApiDocument({ ...options, version: coreVersion });
  const basePath = normalizeOwnAuthBasePath(options.basePath ?? "/api/auth");
  for (const plugin of plugins) {
    for (const endpoint of plugin.endpoints ?? []) {
      const path = `${basePath}${pluginEndpointPath(plugin.id, endpoint)}`;
      const pathItem = document.paths[path] ?? {};
      pathItem[endpoint.method.toLowerCase()] = {
        operationId: `plugin.${plugin.id}.${endpoint.id}`,
        summary: endpoint.summary,
        tags: [`Plugin: ${plugin.id}`],
        ...(endpoint.input ? requestContract(endpoint.method, endpoint.input) : {}),
        responses: {
          "200": {
            description: "Successful response",
            content: { "application/json": { schema: endpoint.output } }
          },
          "400": {
            description: "Plugin request failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OwnAuthError" }
              }
            }
          }
        },
        "x-own-auth-errors": (endpoint.errors ?? []).map(
          (error) => `plugin.${plugin.id}.${error}`
        ),
        ...(endpoint.session === "required"
          ? { security: [{ sessionCookie: [] }, { bearerSession: [] }] }
          : endpoint.session === "optional"
            ? { security: [{}, { sessionCookie: [] }, { bearerSession: [] }] }
            : {})
      };
      document.paths[path] = pathItem;
    }
  }
  return Object.assign(document, {
    "x-own-auth-plugin-fingerprint": createOwnAuthPluginContractFingerprint(
      plugins,
      coreVersion
    )
  });
}

function requestContract(method: "GET" | "POST", schema: Record<string, unknown>) {
  if (method === "GET") {
    return {
      parameters: queryParametersForSchema(schema)
    };
  }
  return {
    requestBody: {
      required: true,
      content: { "application/json": { schema } }
    }
  };
}
