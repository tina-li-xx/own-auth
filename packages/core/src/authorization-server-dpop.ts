import type { AuthEngineContext } from "./auth-engine-context.js";
import { hashAuthorizationSecret } from "./authorization-server-helpers.js";
import { AuthorizationProtocolError } from "./authorization-server-protocol-error.js";
import type { AuthorizationClient } from "./authorization-server-types.js";
import {
  DpopProofValidationError,
  isDpopJwkThumbprint,
  verifyDpopProof
} from "./dpop-crypto.js";
import { AuthError } from "./errors.js";
import { recordDpopVerificationFailure } from "./telemetry.js";

const proofHashDomain = "own-auth:dpop-proof:v1";
const dpopDisabledMessage = "DPoP is not enabled for this authorization server";

export function requireDpopConfiguration(
  ctx: AuthEngineContext,
  enabled: boolean,
  field: string
): void {
  if (typeof enabled !== "boolean") {
    throw new AuthError("validation_error", `${field} must be a boolean`, 400);
  }
  if (enabled && !ctx.authorizationServer?.dpop) {
    throw new AuthError(
      "validation_error",
      `${field} requires authorizationServer.dpop configuration`,
      400
    );
  }
}

export function rejectDpopProofWhenDisabled(
  ctx: AuthEngineContext,
  proof: string | undefined
): void {
  if (proof === undefined || ctx.authorizationServer?.dpop) return;
  recordDpopVerificationFailure("disabled");
  throw new AuthorizationProtocolError("invalid_request", dpopDisabledMessage);
}

export function authorizationRequestDpopJkt(
  ctx: AuthEngineContext,
  client: AuthorizationClient,
  value: string | undefined,
  resourceRequiresDpop = false
): string | null {
  const config = ctx.authorizationServer?.dpop;
  const bindingRequired = Boolean(
    client.dpopBoundAccessTokens || resourceRequiresDpop
  );
  if (!config) {
    if (value !== undefined || bindingRequired) {
      throw new AuthError("validation_error", dpopDisabledMessage, 400);
    }
    return null;
  }
  if (value === undefined) {
    if (bindingRequired) {
      throw new AuthError(
        "validation_error",
        "dpop_jkt is required for this authorization client",
        400
      );
    }
    return null;
  }
  if (!isDpopJwkThumbprint(value)) {
    throw new AuthError("validation_error", "dpop_jkt is invalid", 400);
  }
  return value;
}

export async function verifyAndConsumeDpopProof(
  ctx: AuthEngineContext,
  input: {
    proof?: string;
    expectedJkt: string | null;
    method: string;
    url: string;
    accessToken?: string;
    bindingRequired?: boolean;
    statusCode?: number;
    now?: Date;
  }
): Promise<void> {
  rejectDpopProofWhenDisabled(ctx, input.proof);
  const config = ctx.authorizationServer?.dpop;
  if (!config) {
    if (input.expectedJkt || input.bindingRequired) {
      throw new AuthorizationProtocolError("invalid_request", dpopDisabledMessage);
    }
    return;
  }
  if (!input.expectedJkt) {
    if (input.bindingRequired) {
      throw invalidDpopProof(
        input.proof ? "unexpected" : "missing",
        input.statusCode
      );
    }
    if (input.proof !== undefined) {
      throw invalidDpopProof("unexpected", input.statusCode);
    }
    return;
  }
  if (!input.proof) throw invalidDpopProof("missing", input.statusCode);

  const now = input.now ?? new Date();
  let verified;
  try {
    verified = await verifyDpopProof({
      proof: input.proof,
      method: input.method,
      url: input.url,
      accessToken: input.accessToken,
      proofTtlMs: config.proofTtlMs,
      clockSkewMs: config.clockSkewMs,
      now
    });
  } catch (error) {
    if (error instanceof DpopProofValidationError) {
      throw invalidDpopProof(error.reason, input.statusCode);
    }
    throw error;
  }
  if (verified.jwkThumbprint !== input.expectedJkt) {
    throw invalidDpopProof("thumbprint_mismatch", input.statusCode);
  }

  const storage = ctx.dpopStorage;
  if (!storage) throw unavailableDpopStorage();
  const retentionStartsAt = Math.max(
    now.getTime(),
    verified.issuedAt * 1_000
  );
  const consumed = await storage.consumeDpopProof({
    proofHash: hashAuthorizationSecret(
      ctx,
      `${proofHashDomain}:${verified.jwkThumbprint}:${verified.proofId}`
    ),
    consumedAt: now,
    expiresAt: new Date(
      retentionStartsAt + config.proofTtlMs + config.clockSkewMs
    )
  });
  if (!consumed) throw invalidDpopProof("replayed", input.statusCode);
}

export function cleanupDpopProofs(
  ctx: AuthEngineContext,
  expiredBefore = new Date()
): Promise<number> {
  if (!ctx.authorizationServer?.dpop || !ctx.dpopStorage) {
    throw unavailableDpopStorage();
  }
  if (!(expiredBefore instanceof Date) || Number.isNaN(expiredBefore.getTime())) {
    throw new AuthError("validation_error", "expiredBefore must be a valid date", 400);
  }
  if (expiredBefore.getTime() > Date.now()) {
    throw new AuthError(
      "validation_error",
      "expiredBefore cannot be in the future",
      400
    );
  }
  return ctx.dpopStorage.cleanupDpopProofs(expiredBefore);
}

function invalidDpopProof(
  reason: Parameters<typeof recordDpopVerificationFailure>[0],
  statusCode = 400
): AuthorizationProtocolError {
  recordDpopVerificationFailure(reason);
  return new AuthorizationProtocolError(
    "invalid_dpop_proof",
    "The DPoP proof is invalid",
    { statusCode }
  );
}

function unavailableDpopStorage(): AuthError {
  return new AuthError(
    "authorization_server_not_configured",
    "DPoP storage is unavailable",
    503
  );
}
