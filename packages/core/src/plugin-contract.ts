import { sha256 } from "@noble/hashes/sha256.js";
import { encodeHex } from "./encoding.js";
import { OWN_AUTH_VERSION } from "./version.js";
import { createOwnAuthPluginClientManifest, pluginEndpointPath } from "./plugin-definition.js";
import type {
  OwnAuthPluginClientManifest,
  OwnAuthPluginDefinition
} from "./plugin-types.js";

export interface OwnAuthPluginClientConfiguration {
  fingerprint: string;
  plugins: OwnAuthPluginClientManifest[];
}

export function createOwnAuthPluginContractFingerprint(
  plugins: readonly OwnAuthPluginDefinition[],
  coreVersion = OWN_AUTH_VERSION
): string {
  const contract = {
    coreVersion,
    plugins: [...plugins]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((plugin) => {
        const clientManifest = createOwnAuthPluginClientManifest(plugin);
        const clientMethods = Object.entries(clientManifest.methods)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, method]) => ({ name, ...method }));
        return {
          id: plugin.id,
          version: plugin.version,
          endpoints: [...(plugin.endpoints ?? [])]
            .sort((left, right) =>
              `${left.method}:${pluginEndpointPath(plugin.id, left)}`
                .localeCompare(`${right.method}:${pluginEndpointPath(plugin.id, right)}`)
            )
            .map((endpoint) => ({
              method: endpoint.method,
              path: pluginEndpointPath(plugin.id, endpoint),
              input: endpoint.input ?? null,
              output: endpoint.output,
              errors: [...(endpoint.errors ?? [])].sort(),
              session: endpoint.session ?? "none"
            })),
          ...(clientMethods.length > 0 ? { clientMethods } : {})
        };
      })
  };
  return encodeHex(sha256(new TextEncoder().encode(canonicalJson(contract))));
}

export function createOwnAuthPluginClientConfiguration(
  plugins: readonly OwnAuthPluginDefinition[],
  coreVersion = OWN_AUTH_VERSION
): OwnAuthPluginClientConfiguration {
  return {
    fingerprint: createOwnAuthPluginContractFingerprint(plugins, coreVersion),
    plugins: plugins.map(createOwnAuthPluginClientManifest)
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
