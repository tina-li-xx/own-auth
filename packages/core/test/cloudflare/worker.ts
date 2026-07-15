import { AuthError, createOwnAuth } from "../../dist/index.js";
import {
  createD1Persistence,
  type D1DatabaseLike
} from "../../dist/d1/index.js";

interface Env {
  DB: D1DatabaseLike;
}

const password = "secure-worker-password";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const persistence = createD1Persistence(env.DB);
    const auth = createOwnAuth({
      ...persistence,
      tokenPepper: "cloudflare-worker-compatibility-test"
    });

    try {
      if (request.method === "POST" && url.pathname === "/signup") {
        const { email } = await readJson<{ email: string }>(request);
        const signup = await auth.signUpEmailPassword({ email, password });
        return Response.json({ sessionToken: signup.sessionToken });
      }

      if (request.method === "POST" && url.pathname === "/session") {
        const { sessionToken } = await readJson<{ sessionToken: string }>(request);
        const current = await auth.getCurrentSession(sessionToken);
        return Response.json({ email: current?.user.email ?? null });
      }

      if (request.method === "POST" && url.pathname === "/atomic") {
        return Response.json(await runAtomicChecks(persistence));
      }

      if (request.method === "POST" && url.pathname === "/collision") {
        const email = `collision-${crypto.randomUUID()}@example.com`;
        const results = await Promise.allSettled([
          auth.signUpEmailPassword({ email, password }),
          auth.signUpEmailPassword({ email, password })
        ]);
        const created = results.filter(({ status }) => status === "fulfilled").length;
        const errorCodes = results.flatMap((result) =>
          result.status === "rejected" && result.reason instanceof AuthError
            ? [result.reason.code]
            : []
        );
        return Response.json({ created, errorCodes });
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
};

async function runAtomicChecks(
  persistence: ReturnType<typeof createD1Persistence>
): Promise<{ rateCounts: number[]; tokenWinners: number }> {
  const now = new Date();
  const tokenHash = `token_${crypto.randomUUID()}`;
  await persistence.storage.createToken({
    id: `tok_${crypto.randomUUID()}`,
    tokenHash,
    type: "magic_link",
    userId: null,
    email: "atomic@example.com",
    phone: null,
    organisationId: null,
    expiresAt: new Date(now.getTime() + 60_000),
    usedAt: null,
    createdAt: now
  });
  const tokenResults = await Promise.all([
    persistence.storage.consumeToken(tokenHash, "magic_link", now),
    persistence.storage.consumeToken(tokenHash, "magic_link", now)
  ]);

  const rateKey = `rate_${crypto.randomUUID()}`;
  const rateResults = await Promise.all(
    Array.from({ length: 10 }, () =>
      persistence.rateLimitStore.hit(rateKey, 60_000, 5)
    )
  );

  return {
    rateCounts: rateResults.map(({ count }) => count).sort((left, right) => left - right),
    tokenWinners: tokenResults.filter(Boolean).length
  };
}

async function readJson<Value>(request: Request): Promise<Value> {
  return request.json() as Promise<Value>;
}
