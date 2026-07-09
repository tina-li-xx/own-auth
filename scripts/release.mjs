import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];

if (command === "check-clean") {
  assertCleanWorkingTree();
} else if (command === "tag") {
  tagRelease();
} else {
  console.error("Usage: node scripts/release.mjs <check-clean|tag>");
  process.exit(1);
}

function tagRelease() {
  assertCleanWorkingTree();

  const packageJson = JSON.parse(
    readFileSync(resolve(rootDir, "packages/core/package.json"), "utf8")
  );
  const tagName = `v${packageJson.version}`;

  if (hasLocalTag(tagName)) {
    throw new Error(`Tag already exists locally: ${tagName}`);
  }

  run("git", ["tag", "-a", tagName, "-m", `own-auth ${tagName}`]);
  run("git", ["push", "origin", tagName]);
}

function assertCleanWorkingTree() {
  const status = output("git", ["status", "--porcelain"]);

  if (status.trim()) {
    console.error(status);
    throw new Error("Release requires a clean working tree.");
  }
}

function hasLocalTag(tagName) {
  try {
    output("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
    return true;
  } catch {
    return false;
  }
}

function run(commandName, args) {
  execFileSync(commandName, args, {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function output(commandName, args) {
  return execFileSync(commandName, args, {
    cwd: rootDir,
    encoding: "utf8"
  });
}
