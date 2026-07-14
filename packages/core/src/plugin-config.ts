import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import { validatePluginSet } from "./plugin-definition.js";
import type { OwnAuthConfig } from "./plugin-types.js";
import { isRecord } from "./value-guards.js";

const defaultConfigFiles = [
  "own-auth.config.ts",
  "own-auth.config.mts",
  "own-auth.config.js",
  "own-auth.config.mjs",
  "own-auth.config.cjs"
] as const;

export async function loadOwnAuthConfig(
  configuredPath?: string,
  cwd = process.cwd()
): Promise<{ config: OwnAuthConfig; path: string | null }> {
  const path = configuredPath
    ? resolve(cwd, configuredPath)
    : await findDefaultConfig(cwd);
  if (!path) return { config: {}, path: null };
  if (configuredPath && !(await exists(path))) {
    throw new Error(`Own Auth config was not found: ${path}`);
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = await jiti.import<unknown>(path, { default: true });
  if (!isRecord(loaded)) {
    throw new Error(`Own Auth config must export an object: ${path}`);
  }
  const config = loaded as OwnAuthConfig;
  validatePluginSet(config.plugins ?? []);
  return { config, path };
}

async function findDefaultConfig(cwd: string): Promise<string | null> {
  for (const file of defaultConfigFiles) {
    const path = resolve(cwd, file);
    if (await exists(path)) return path;
  }
  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
