import { register } from "node:module";

register("./postgres-import-guard.mjs", import.meta.url);

const {
  InMemoryAuthStorage,
  createOwnAuth
} = await import("../packages/core/dist/index.js");

const auth = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "lazy-postgres-import-check"
});
const signup = await auth.signUpEmailPassword({
  email: "portable@example.com",
  password: "secure-password"
});
const current = await auth.requireCurrentSession(signup.sessionToken);

if (current.user.email !== "portable@example.com") {
  throw new Error("Custom-storage auth flow did not complete.");
}

await auth.close();
console.log("Built package custom-storage path did not resolve pg or pg/*.");
