import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStorage,
  createOwnAuth,
  createOwnAuthPluginContractFingerprint,
  defineOwnAuthPlugin
} from "../src/index.js";

describe("plugin runtime", () => {
  it("runs direct SDK calls through immutable before-hooks and redacted after-hooks", async () => {
    let beforeInput: unknown;
    let afterResult: unknown;
    const plugin = defineOwnAuthPlugin({
      id: "hook-audit",
      version: "1.0.0",
      beforeHooks: [{
        id: "before-sign-in",
        operations: ["signInEmailPassword"],
        run(context) {
          beforeInput = context.input;
        }
      }],
      afterHooks: [{
        id: "after-sign-in",
        operations: ["signInEmailPassword"],
        run(context) {
          afterResult = context.result;
        }
      }]
    });
    const auth = createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "plugin-hooks",
      plugins: [plugin]
    });
    await auth.signUpEmailPassword({
      email: "plugin@example.com",
      password: "correct-horse"
    });
    await auth.signInEmailPassword({
      email: "plugin@example.com",
      password: "correct-horse"
    });

    expect(beforeInput).toMatchObject({ password: "correct-horse" });
    expect(afterResult).toMatchObject({ sessionToken: "[redacted]" });
    expect(Object.isFrozen(beforeInput)).toBe(true);
  });

  it("fails direct SDK operations closed when a before-hook denies them", async () => {
    const plugin = defineOwnAuthPlugin({
      id: "access-policy",
      version: "1.0.0",
      errors: ["blocked"],
      beforeHooks: [{
        id: "block-create-user",
        operations: ["createUser"],
        run: () => ({ allow: false, error: "blocked", message: "Creation is blocked" })
      }]
    });
    const auth = createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "plugin-deny",
      plugins: [plugin]
    });

    await expect(auth.createUser({ email: "blocked@example.com" })).rejects.toMatchObject({
      code: "plugin.access-policy.blocked"
    });
  });

  it("fails closed when a before-hook times out", async () => {
    const plugin = defineOwnAuthPlugin({
      id: "slow-policy",
      version: "1.0.0",
      beforeHooks: [{
        id: "never-finishes",
        operations: ["createUser"],
        run: () => new Promise<never>(() => undefined)
      }]
    });
    const auth = createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "plugin-timeout",
      plugins: [plugin],
      pluginRuntime: { beforeHookTimeoutMs: 1 }
    });

    await expect(auth.createUser({ email: "timeout@example.com" })).rejects.toMatchObject({
      code: "plugin_hook_timeout"
    });
  });

  it("reports after-hook failures without rolling back completed auth work", async () => {
    const reported: Array<{ hookId: string; operation: string }> = [];
    const plugin = defineOwnAuthPlugin({
      id: "after-reporting",
      version: "1.0.0",
      afterHooks: [{
        id: "broken-reporter",
        operations: ["signUpEmailPassword"],
        run() {
          throw new Error("reporting failed");
        }
      }]
    });
    const auth = createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "plugin-after-hook",
      plugins: [plugin],
      pluginRuntime: {
        onAfterHookError(_error, details) {
          reported.push({ hookId: details.hookId, operation: details.operation });
        }
      }
    });

    await expect(auth.signUpEmailPassword({
      email: "after-hook@example.com",
      password: "correct-horse"
    })).resolves.toMatchObject({ status: "complete" });
    await expect(auth.storage.getUserByEmail("after-hook@example.com")).resolves.not.toBeNull();
    expect(reported).toEqual([{
      hookId: "broken-reporter",
      operation: "signUpEmailPassword"
    }]);
  });

  it("changes the plugin fingerprint when an endpoint contract changes", () => {
    const first = contractPlugin({ type: "string" });
    const second = contractPlugin({ type: "number" });

    expect(createOwnAuthPluginContractFingerprint([first])).not.toBe(
      createOwnAuthPluginContractFingerprint([second])
    );
  });
});

function contractPlugin(output: Record<string, unknown>) {
  return defineOwnAuthPlugin({
    id: "contract",
    version: "1.0.0",
    endpoints: [{
      id: "read",
      method: "GET",
      path: "/read",
      summary: "Read plugin data",
      output,
      handler: () => "ok"
    }]
  });
}
