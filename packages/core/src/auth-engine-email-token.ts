import { normalizeEmail } from "./normalise.js";
import type { AuditEventType, RequestContext, TokenType } from "./types.js";
import type { DeliveryResult } from "./auth-engine-types.js";
import {
  audit,
  buildUrl,
  delivery,
  issueToken,
  rateLimit,
  type AuthEngineContext
} from "./auth-engine-internals.js";

export async function requestEmailToken(
  ctx: AuthEngineContext,
  input: {
    email: string;
    tokenType: TokenType;
    emailType: Exclude<TokenType, "phone_verification">;
    urlPath: string;
    auditEvent: AuditEventType;
    rateLimitKey: string;
    rateLimitMax: number;
    rateLimitWindowMs: number;
    extraUrlParams?: Record<string, string | undefined>;
    allowMissing?: boolean;
    request?: RequestContext;
  }
): Promise<DeliveryResult> {
  const email = normalizeEmail(input.email);
  await rateLimit(ctx, input.rateLimitKey, email, input.rateLimitMax, input.rateLimitWindowMs);

  const user = await ctx.storage.getUserByEmail(email);
  if (!user && !input.allowMissing) {
    return { sent: true, expiresAt: null };
  }

  const issued = await issueToken(ctx, input.tokenType, {
    userId: user?.id ?? null,
    email,
    ttlMs: ctx.tokenTtls[input.tokenType]
  });
  const url = buildUrl(ctx, input.urlPath, {
    token: issued.rawToken,
    ...input.extraUrlParams
  });

  await ctx.emailProvider.send({
    to: email,
    type: input.emailType,
    token: issued.rawToken,
    url,
    expiresAt: issued.token.expiresAt
  });

  await audit(ctx, {
    eventType: input.auditEvent,
    actorUserId: user?.id ?? null,
    targetUserId: user?.id ?? null,
    context: input.request
  });

  return delivery(ctx, issued.rawToken, url, issued.token.expiresAt);
}
