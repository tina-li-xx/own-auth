import { register } from "node:module";

register("./root-import-guard.mjs", import.meta.url);

const { InMemoryAuthStorage, createOwnAuth } = await import(
  "../packages/core/dist/index.js"
);
const auth = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "root-package-loading-check"
});
const signup = await auth.signUpEmailPassword({
  email: "portable-root@example.com",
  password: "secure-password"
});
const current = await auth.requireCurrentSession(signup.sessionToken);
if (current.user.email !== "portable-root@example.com") {
  throw new Error("Root-package auth flow did not complete");
}
await auth.close();

console.log("Built package root did not load Postgres or SAML dependencies.");
