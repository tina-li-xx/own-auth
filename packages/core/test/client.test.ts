import { describe, expect, it } from "vitest";
import { createOwnAuthClient, OwnAuthClientError } from "../src/client.js";
import {
  createOwnAuth,
  createOwnAuthHandler,
  InMemoryAuthStorage,
  MemoryEmailProvider,
  MemorySmsProvider
} from "../src/index.js";

function createClientHarness() {
  const auth = createOwnAuth({
    storage: new InMemoryAuthStorage(),
    emailProvider: new MemoryEmailProvider(),
    smsProvider: new MemorySmsProvider(),
    tokenPepper: "client-test-pepper"
  });
  const handler = createOwnAuthHandler(auth);
  let cookie = "";
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", "http://localhost");
    if (cookie) {
      headers.set("cookie", cookie);
    }
    const url = input instanceof Request
      ? input.url
      : new URL(input.toString(), "http://localhost").toString();
    const response = await handler(new Request(url, { ...init, headers }));
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      cookie = setCookie.split(";", 1)[0] ?? "";
    }
    return response;
  }) as typeof fetch;

  return createOwnAuthClient({
    baseURL: "http://localhost/api/auth",
    fetch: fetchImpl
  });
}

describe("OwnAuthClient", () => {
  it("shares one initial session request between subscribers", async () => {
    let requestCount = 0;
    const client = createOwnAuthClient({
      baseURL: "http://localhost/api/auth",
      fetch: (async () => {
        requestCount += 1;
        await Promise.resolve();
        return Response.json({ session: null });
      }) as typeof fetch
    });

    const [first, second] = await Promise.all([
      client.ensureSession(),
      client.ensureSession()
    ]);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(requestCount).toBe(1);
    expect(client.getSessionSnapshot()).toEqual({
      data: null,
      isPending: false,
      error: null
    });
  });

  it("keeps its current-session state in sync with auth mutations", async () => {
    const client = createClientHarness();
    const updates: Array<string | null> = [];
    const unsubscribe = client.subscribe(() => {
      updates.push(client.getSessionSnapshot().data?.user.email ?? null);
    });

    const signup = await client.signUpEmailPassword({
      email: "client@example.com",
      password: "correct-horse"
    });
    const session = await client.getSession();

    expect(signup.user.email).toBe("client@example.com");
    expect(session?.user.email).toBe("client@example.com");
    expect(client.getSessionSnapshot()).toMatchObject({
      data: { user: { email: "client@example.com" } },
      isPending: false,
      error: null
    });

    await client.signOut();
    expect(client.getSessionSnapshot().data).toBeNull();
    expect(updates).toContain("client@example.com");
    expect(updates.at(-1)).toBeNull();
    unsubscribe();
  });

  it("throws typed client errors from the shared error envelope", async () => {
    const client = createClientHarness();

    await expect(client.signInEmailPassword({
      email: "missing@example.com",
      password: "wrong-password"
    })).rejects.toEqual(expect.objectContaining({
      name: "OwnAuthClientError",
      code: "invalid_credentials",
      status: 401
    }));

    try {
      await client.signInEmailPassword({
        email: "missing@example.com",
        password: "wrong-password"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OwnAuthClientError);
    }
  });

  it.each([null, "different-fingerprint"])(
    "rejects plugin responses with an absent or stale contract fingerprint: %s",
    async (serverFingerprint) => {
      const client = createOwnAuthClient({
        baseURL: "http://localhost/api/auth",
        pluginFingerprint: "expected-fingerprint",
        plugins: [{
          id: "example",
          methods: {
            ping: { method: "POST", path: "/plugins/example/ping" }
          }
        }],
        fetch: (async () => Response.json(
          { ok: true },
          serverFingerprint
            ? { headers: { "x-own-auth-plugin-fingerprint": serverFingerprint } }
            : undefined
        )) as typeof fetch
      });

      await expect(client.plugin("example").call("ping")).rejects.toMatchObject({
        code: "internal_error",
        status: 409
      });
    }
  );
});
