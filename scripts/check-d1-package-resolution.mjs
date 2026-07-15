import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageDirectory = join(root, "packages/core");
const fixture = await mkdtemp(join(tmpdir(), "own-auth-d1-resolution-"));

try {
  await mkdir(join(fixture, "node_modules"), { recursive: true });
  await symlink(packageDirectory, join(fixture, "node_modules/own-auth"), "dir");
  await writeFile(join(fixture, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(
    join(fixture, "index.ts"),
    `import { createD1Persistence, type D1DatabaseLike } from "own-auth/d1";

declare const database: D1DatabaseLike;
const persistence = createD1Persistence(database);
void persistence.storage;
void persistence.rateLimitStore;
`,
    "utf8"
  );
  await writeFile(
    join(fixture, "runtime.mjs"),
    `import { createD1Persistence } from "own-auth/d1";
if (typeof createD1Persistence !== "function") {
  throw new Error("own-auth/d1 did not expose createD1Persistence");
}
`,
    "utf8"
  );

  await checkTypeScriptResolution("node16", {
    module: "Node16",
    moduleResolution: "Node16"
  });
  await checkTypeScriptResolution("bundler", {
    module: "ESNext",
    moduleResolution: "Bundler"
  });
  await run(process.execPath, [join(fixture, "runtime.mjs")]);

  console.log("own-auth/d1 resolves in Node, TypeScript node16, and TypeScript bundler modes.");
} finally {
  await rm(fixture, { recursive: true, force: true });
}

async function checkTypeScriptResolution(name, resolution) {
  const config = join(fixture, `tsconfig.${name}.json`);
  await writeFile(
    config,
    `${JSON.stringify({
      compilerOptions: {
        ...resolution,
        target: "ES2022",
        noEmit: true,
        skipLibCheck: true,
        strict: true
      },
      files: ["index.ts"]
    }, null, 2)}\n`,
    "utf8"
  );
  await run(join(root, "node_modules/.bin/tsc"), ["-p", config]);
}

async function run(command, args) {
  const output = [];
  const child = spawn(command, args, {
    cwd: fixture,
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
