import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const config = "packages/core/test/cloudflare/wrangler.jsonc";
const database = "own-auth-worker-compatibility";
const port = 18_787;
const persistenceDirectory = await mkdtemp(join(tmpdir(), "own-auth-d1-"));
let worker;
const workerOutput = [];

try {
  await runWrangler([
    "d1",
    "migrations",
    "apply",
    database,
    "--local",
    "--config",
    config,
    "--persist-to",
    persistenceDirectory
  ]);

  worker = spawnWrangler([
    "dev",
    "--config",
    config,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--persist-to",
    persistenceDirectory
  ], workerOutput);

  const origin = `http://127.0.0.1:${port}`;
  await waitForWorker(origin, worker, workerOutput);

  const email = `worker-${crypto.randomUUID()}@example.com`;
  const signup = await postJson(`${origin}/signup`, { email });
  const session = await postJson(`${origin}/session`, {
    sessionToken: signup.sessionToken
  });
  if (session.email !== email) {
    throw new Error("Cloudflare D1 did not persist the session across requests.");
  }

  const atomic = await postJson(`${origin}/atomic`, {});
  if (atomic.tokenWinners !== 1) {
    throw new Error("Cloudflare D1 allowed a one-time token to be consumed more than once.");
  }
  const expectedCounts = Array.from({ length: 10 }, (_, index) => index + 1);
  if (JSON.stringify(atomic.rateCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error("Cloudflare D1 lost concurrent rate-limit increments.");
  }

  const collision = await postJson(`${origin}/collision`, {});
  if (
    collision.created !== 1 ||
    !collision.errorCodes.includes("email_already_exists")
  ) {
    throw new Error("Cloudflare D1 did not map an email collision to a typed auth error.");
  }

  console.log("Cloudflare D1 auth, persistence, and atomicity checks passed.");
} catch (error) {
  if (workerOutput.length > 0) console.error(workerOutput.join(""));
  throw error;
} finally {
  await stopWorker(worker);
  await rm(persistenceDirectory, { recursive: true, force: true });
}

function spawnWrangler(args, output = []) {
  const child = spawn(
    "pnpm",
    ["dlx", "wrangler@4.110.0", ...args],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  return child;
}

async function runWrangler(args) {
  const output = [];
  const child = spawnWrangler(args, output);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (exitCode !== 0) {
    throw new Error(`Wrangler exited with code ${exitCode}.\n${output.join("")}`);
  }
}

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
}

async function waitForWorker(origin, process, output) {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Cloudflare Worker exited with code ${process.exitCode}.\n${output.join("")}`);
    }
    try {
      const response = await fetch(`${origin}/missing`);
      if (response.status === 404) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Cloudflare Worker did not become ready within 90 seconds.", {
    cause: lastError
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}
