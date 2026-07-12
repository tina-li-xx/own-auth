import { spawn } from "node:child_process";

const port = 18_787;
const output = [];
const worker = spawn(
  "pnpm",
  [
    "dlx",
    "wrangler@4.110.0",
    "dev",
    "--config",
    "packages/core/test/cloudflare/wrangler.jsonc",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port)
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

worker.stdout.on("data", recordOutput);
worker.stderr.on("data", recordOutput);

try {
  const result = await waitForWorker(`http://127.0.0.1:${port}`);
  if (result.authenticated !== true) {
    throw new Error("Cloudflare Worker auth flow did not authenticate the user.");
  }

  console.log("Cloudflare Worker auth flow passed.");
} catch (error) {
  console.error(output.join(""));
  throw error;
} finally {
  worker.kill("SIGTERM");
}

function recordOutput(chunk) {
  output.push(chunk.toString());
}

async function waitForWorker(url) {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    if (worker.exitCode !== null) {
      throw new Error(`Cloudflare Worker exited with code ${worker.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Cloudflare Worker returned status ${response.status}.`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error("Cloudflare Worker did not become ready within 90 seconds.", {
    cause: lastError
  });
}
