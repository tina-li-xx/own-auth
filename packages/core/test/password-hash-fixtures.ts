import { scryptSync } from "node:crypto";

const LEGACY_SCRYPT_N = 16384;
const LEGACY_SCRYPT_R = 8;
const LEGACY_SCRYPT_P = 1;
const LEGACY_SCRYPT_KEY_LENGTH = 64;
const LEGACY_SCRYPT_SALT = Buffer.alloc(16, 7).toString("base64url");

export const nativeArgon2idHash =
  "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$hJoYPdPiQWIdd8GX7Bhmq9i6c6CuMZz2GKVdAQ7c+do";

export function legacyScryptHash(password: string): string {
  const key = scryptSync(password, LEGACY_SCRYPT_SALT, LEGACY_SCRYPT_KEY_LENGTH, {
    N: LEGACY_SCRYPT_N,
    r: LEGACY_SCRYPT_R,
    p: LEGACY_SCRYPT_P
  });

  return [
    "scrypt",
    LEGACY_SCRYPT_N,
    LEGACY_SCRYPT_R,
    LEGACY_SCRYPT_P,
    LEGACY_SCRYPT_SALT,
    key.toString("base64url")
  ].join("$");
}
