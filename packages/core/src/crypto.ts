import * as argon2 from "argon2";
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";

const ARGON2_MEMORY_COST = 19 * 1024;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const ARGON2_VERSION = 0x13;

const LEGACY_SCRYPT_VERSION = "scrypt";
const LEGACY_SCRYPT_N = 16384;
const LEGACY_SCRYPT_R = 8;
const LEGACY_SCRYPT_P = 1;
const LEGACY_SCRYPT_KEY_LENGTH = 64;

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
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    version: ARGON2_VERSION
  });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (encodedHash.startsWith("$argon2id$")) {
    try {
      return await argon2.verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  return verifyLegacyScryptPassword(password, encodedHash);
}

export function passwordNeedsRehash(encodedHash: string): boolean {
  if (!encodedHash.startsWith("$argon2id$")) {
    return true;
  }

  try {
    return argon2.needsRehash(encodedHash, {
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      version: ARGON2_VERSION
    });
  } catch {
    return true;
  }
}

async function verifyLegacyScryptPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 6) {
    return false;
  }

  const [version, nValue, rValue, pValue, salt, key] = parts;
  if (
    version !== LEGACY_SCRYPT_VERSION ||
    nValue !== String(LEGACY_SCRYPT_N) ||
    rValue !== String(LEGACY_SCRYPT_R) ||
    pValue !== String(LEGACY_SCRYPT_P) ||
    !salt ||
    !key
  ) {
    return false;
  }

  const encodedSalt = Buffer.from(salt, "base64url");
  const expected = Buffer.from(key, "base64url");
  if (
    encodedSalt.length !== 16 ||
    encodedSalt.toString("base64url") !== salt ||
    expected.length !== LEGACY_SCRYPT_KEY_LENGTH ||
    expected.toString("base64url") !== key
  ) {
    return false;
  }

  try {
    const actual = await deriveLegacyScryptKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function deriveLegacyScryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      LEGACY_SCRYPT_KEY_LENGTH,
      {
        N: LEGACY_SCRYPT_N,
        r: LEGACY_SCRYPT_R,
        p: LEGACY_SCRYPT_P
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(key);
      }
    );
  });
}
