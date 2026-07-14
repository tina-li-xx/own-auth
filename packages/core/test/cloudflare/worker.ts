import {
  InMemoryAuthStorage,
  createOwnAuth
} from "../../dist/index.js";

export default {
  async fetch(): Promise<Response> {
    const auth = createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "cloudflare-worker-compatibility-test"
    });
    const email = `worker-${crypto.randomUUID()}@example.com`;
    const signup = await auth.signUpEmailPassword({
      email,
      password: "secure-worker-password"
    });
    await auth.signOut(signup.sessionToken);
    const signin = await auth.signInEmailPassword({
      email,
      password: "secure-worker-password"
    });
    if (signin.status !== "complete") {
      throw new Error("Cloudflare compatibility user unexpectedly requires MFA");
    }
    const current = await auth.getCurrentSession(signin.sessionToken);

    return Response.json({
      authenticated: current?.user.email === email
    });
  }
};
