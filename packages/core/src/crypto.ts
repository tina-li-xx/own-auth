import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const PASSWORD_VERSION = "scrypt";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

export function randomBase64Url(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function randomNumericCode(length = 6): string {
  const digits: string[] = [];

  while (digits.length < length) {
    const value = randomBytes(1)[0] ?? 0;
    if (value < 250) {
      digits.push(String(value % 10));
    }
  }

  return digits.join("");
}

export function createId(prefix: string): string {
  return `${prefix}_${randomBase64Url(16)}`;
}

export function hashSecret(secret: string, pepper?: string): string {
  if (pepper && pepper.length > 0) {
    return createHmac("sha256", pepper).update(secret).digest("hex");
  }

  return createHash("sha256").update(secret).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBase64Url(16);
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });

  return [
    PASSWORD_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt,
    key.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [version, nValue, rValue, pValue, salt, key] = encodedHash.split("$");

  if (version !== PASSWORD_VERSION || !nValue || !rValue || !pValue || !salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, "base64url");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue)
  });

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
