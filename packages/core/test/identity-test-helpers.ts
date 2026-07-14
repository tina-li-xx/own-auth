import { Secret, TOTP } from "otpauth";
import type { SignInResult } from "../src/index.js";

export function createTotpCode(secret: string, timestamp = Date.now()): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30
  }).generate({ timestamp });
}

export function requireCompleteSignIn(result: SignInResult) {
  if (result.status !== "complete") throw new Error("Expected completed sign-in");
  return result;
}

export function requireMfaSignIn(result: SignInResult) {
  if (result.status !== "mfa_required") throw new Error("Expected MFA challenge");
  return result;
}
