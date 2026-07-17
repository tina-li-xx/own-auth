import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export async function checkPackageResolution(options) {
  const fixture = await mkdtemp(join(tmpdir(), options.fixturePrefix));
  try {
    await mkdir(join(fixture, "node_modules"), { recursive: true });
    await symlink(
      join(repositoryRoot, "packages/core"),
      join(fixture, "node_modules/own-auth"),
      "dir"
    );
    await writeFile(join(fixture, "package.json"), '{"type":"module"}\n', "utf8");
    await writeFile(join(fixture, "index.ts"), options.typeScriptSource, "utf8");
    await writeFile(join(fixture, "runtime.mjs"), options.runtimeSource, "utf8");

    await checkTypeScriptResolution(fixture, "node16", {
      module: "Node16",
      moduleResolution: "Node16"
    });
    await checkTypeScriptResolution(fixture, "bundler", {
      module: "ESNext",
      moduleResolution: "Bundler"
    });
    await run(fixture, process.execPath, [join(fixture, "runtime.mjs")]);
    console.log(options.successMessage);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function checkTypeScriptResolution(fixture, name, resolution) {
  const config = join(fixture, `tsconfig.${name}.json`);
  await writeFile(config, `${JSON.stringify({
    compilerOptions: {
      ...resolution,
      target: "ES2022",
      noEmit: true,
      skipLibCheck: true,
      strict: true
    },
    files: ["index.ts"]
  }, null, 2)}\n`, "utf8");
  await run(fixture, join(repositoryRoot, "node_modules/.bin/tsc"), ["-p", config]);
}

async function run(cwd, command, args) {
  const output = [];
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}.\n${output.join("")}`);
  }
}
