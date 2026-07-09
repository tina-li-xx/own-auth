import { AuthError } from "./errors.js";
import { isExpired } from "./normalise.js";
import type { CurrentSession, RequestContext, Session } from "./types.js";
import {
  audit,
  hash,
  type AuthEngineContext
} from "./auth-engine-internals.js";

export async function getCurrentSession(
  ctx: AuthEngineContext,
  sessionToken: string
): Promise<CurrentSession | null> {
  const tokenHash = hash(ctx, sessionToken);
  const session = await ctx.storage.getSessionByTokenHash(tokenHash);
  const now = new Date();

  if (
    !session ||
    session.revokedAt ||
    isExpired(session.expiresAt, now) ||
    isExpired(session.idleExpiresAt, now)
  ) {
    return null;
  }

  const user = await ctx.storage.getUserById(session.userId);
  if (!user || user.disabledAt) {
    return null;
  }

  const updatedSession = await ctx.storage.updateSession(session.id, {
    lastActiveAt: now,
    idleExpiresAt: new Date(now.getTime() + ctx.sessionIdleTtlMs)
  });

  return {
    session: updatedSession ?? session,
    user
  };
}

export async function requireCurrentSession(
  ctx: AuthEngineContext,
  sessionToken: string
): Promise<CurrentSession> {
  const currentSession = await getCurrentSession(ctx, sessionToken);

  if (!currentSession) {
    throw new AuthError("invalid_session", "Invalid or expired session", 401);
  }

  return currentSession;
}

export async function signOut(
  ctx: AuthEngineContext,
  sessionToken: string,
  context?: RequestContext
): Promise<void> {
  const tokenHash = hash(ctx, sessionToken);
  const session = await ctx.storage.getSessionByTokenHash(tokenHash);

  if (!session || session.revokedAt) {
    return;
  }

  const now = new Date();
  await ctx.storage.updateSession(session.id, {
    revokedAt: now,
    revokeReason: "user_logout"
  });
  await audit(ctx, {
    eventType: "user.signed_out",
    actorUserId: session.userId,
    targetUserId: session.userId,
    context
  });
  await audit(ctx, {
    eventType: "session.revoked",
    actorUserId: session.userId,
    targetUserId: session.userId,
    context,
    metadata: { reason: "user_logout" }
  });
}

export async function revokeAllSessions(
  ctx: AuthEngineContext,
  userId: string,
  reason = "all_sessions_revoked"
): Promise<number> {
  const sessions = await ctx.storage.listSessionsByUserId(userId);
  const now = new Date();
  let revoked = 0;

  for (const session of sessions) {
    if (!session.revokedAt) {
      await ctx.storage.updateSession(session.id, {
        revokedAt: now,
        revokeReason: reason
      });
      revoked += 1;
    }
  }

  await audit(ctx, {
    eventType: "session.revoked_all",
    actorUserId: userId,
    targetUserId: userId,
    metadata: { reason, revoked }
  });

  return revoked;
}

export async function revokeOtherSessions(
  ctx: AuthEngineContext,
  userId: string,
  currentSessionId: string,
  reason = "other_sessions_revoked"
): Promise<number> {
  const sessions = await ctx.storage.listSessionsByUserId(userId);
  const now = new Date();
  let revoked = 0;

  for (const session of sessions) {
    if (!session.revokedAt && session.id !== currentSessionId) {
      await ctx.storage.updateSession(session.id, {
        revokedAt: now,
        revokeReason: reason
      });
      revoked += 1;
    }
  }

  await audit(ctx, {
    eventType: "session.revoked_other",
    actorUserId: userId,
    targetUserId: userId,
    metadata: { reason, revoked }
  });

  return revoked;
}

export async function listSessions(
  ctx: AuthEngineContext,
  userId: string
): Promise<Session[]> {
  return ctx.storage.listSessionsByUserId(userId);
}
