import type { OwnAuth } from "../auth-engine.js";
import { AuthError } from "../errors.js";
import type { RequestContext } from "../types.js";
import type {
  MfaRequiredResult,
  OAuthCompletionResult,
  SessionResult,
  SignInResult
} from "../auth-engine-types.js";
import type {
  OwnAuthEndpointId,
  OwnAuthEndpointInputMap,
  SignInPayload
} from "./contract.js";
import {
  serializeAuthSession,
  serializeDelivery,
  serializeMember,
  serializeOrganisation,
  serializePasskey,
  serializeUser
} from "./serializers.js";

export interface EndpointExecution {
  body: unknown;
  setSession?: { token: string; expiresAt: Date };
  setMfaChallenge?: { token: string; expiresAt: Date };
  clearSession?: boolean;
  clearMfaChallenge?: boolean;
  oauthCallback?: {
    destination: string | null;
    interactionMode: "redirect" | "popup";
    openerOrigin: string | null;
  };
}

export async function executeEndpoint(
  auth: OwnAuth,
  endpointId: OwnAuthEndpointId,
  rawInput: Record<string, unknown> | undefined,
  sessionToken: string | null,
  mfaChallengeToken: string | null,
  request: RequestContext
): Promise<EndpointExecution> {
  switch (endpointId) {
    case "signUpEmailPassword":
      return signInExecution(await auth.signUpEmailPassword({
        ...inputAs(rawInput, endpointId), request
      }));
    case "signInEmailPassword":
      return signInExecution(await auth.signInEmailPassword({
        ...inputAs(rawInput, endpointId), request
      }));
    case "getSession": {
      const current = sessionToken ? await auth.getCurrentSession(sessionToken) : null;
      return { body: { session: current ? serializeAuthSession(current) : null } };
    }
    case "signOut":
      if (sessionToken) await auth.signOut(sessionToken, request);
      return {
        body: { success: true },
        clearSession: true,
        clearMfaChallenge: true
      };
    case "changePassword": {
      const user = await auth.changePassword({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      });
      return { body: { user: serializeUser(user) } };
    }
    case "requestMagicLink":
      return { body: serializeDelivery(await auth.requestMagicLink({
        ...inputAs(rawInput, endpointId), request
      })) };
    case "verifyMagicLink":
      return signInExecution(await auth.verifyMagicLink({
        ...inputAs(rawInput, endpointId), request
      }));
    case "requestEmailVerification":
      return { body: serializeDelivery(await auth.requestEmailVerification({
        ...inputAs(rawInput, endpointId), request
      })) };
    case "verifyEmail":
      return { body: { user: serializeUser(await auth.verifyEmail({
        ...inputAs(rawInput, endpointId), request
      })) } };
    case "requestPasswordReset":
      return { body: serializeDelivery(await auth.requestPasswordReset({
        ...inputAs(rawInput, endpointId), request
      })) };
    case "resetPassword":
      return {
        body: { user: serializeUser(await auth.resetPassword({
          ...inputAs(rawInput, endpointId), request
        })) },
        clearSession: true,
        clearMfaChallenge: true
      };
    case "requestSmsOtp": {
      const input = inputAs(rawInput, endpointId);
      const userId = input.purpose === "phone_verification"
        ? (await auth.requireCurrentSession(requireToken(sessionToken, "session"))).user.id
        : undefined;
      return { body: serializeDelivery(await auth.requestSmsOtp({
        ...input, userId, request
      })) };
    }
    case "verifySmsOtp": {
      const result = await auth.verifySmsOtp({ ...inputAs(rawInput, endpointId), request });
      if (result.status === "verified") {
        return { body: { status: "verified", user: serializeUser(result.user) } };
      }
      return signInExecution(result);
    }
    case "acceptInvite": {
      const current = await auth.requireCurrentSession(requireToken(sessionToken, "session"));
      const result = await auth.acceptInvite({
        ...inputAs(rawInput, endpointId), userId: current.user.id, request
      });
      return { body: {
        organisation: serializeOrganisation(result.organisation),
        member: serializeMember(result.member)
      } };
    }
    case "oauthStart": {
      const input = inputAs(rawInput, endpointId);
      const actorUserId = input.intent === "link"
        ? (await auth.requireCurrentSession(requireToken(sessionToken, "session"))).user.id
        : undefined;
      const result = await auth.createOAuthAuthorizationUrl({
        ...input, actorUserId, request
      });
      return { body: { url: result.url, expiresAt: result.expiresAt.toISOString() } };
    }
    case "oauthGoogleCallback":
      return oauthExecution(await completeOAuth(auth, "google", rawInput, request));
    case "oauthGitHubCallback":
      return oauthExecution(await completeOAuth(auth, "github", rawInput, request));
    case "oauthAppleCallback":
    case "oauthAppleCallbackPost":
      return oauthExecution(await completeOAuth(auth, "apple", rawInput, request));
    case "prepareGoogleOneTap": {
      const result = await auth.prepareGoogleOneTap({ request });
      return { body: { nonce: result.nonce, expiresAt: result.expiresAt.toISOString() } };
    }
    case "signInGoogleOneTap": {
      const result = await auth.signInWithGoogleOneTap({
        ...inputAs(rawInput, endpointId), request
      });
      if (result.status === "linked") {
        throw new AuthError("oauth_provider_error", "Google One Tap sign-in failed", 500);
      }
      return signInExecution(result);
    }
    case "unlinkOAuthProvider": {
      const current = await auth.requireCurrentSession(requireToken(sessionToken, "session"));
      await auth.unlinkOAuthProvider({
        ...inputAs(rawInput, endpointId), actorUserId: current.user.id, request
      });
      return { body: { success: true } };
    }
    case "completeMfaTotp":
      return completedMfaExecution(await auth.completeMfaWithTotp({
        ...inputAs(rawInput, endpointId),
        challengeToken: requireToken(mfaChallengeToken, "MFA challenge"),
        request
      }));
    case "completeMfaRecovery":
      return completedMfaExecution(await auth.completeMfaWithRecoveryCode({
        ...inputAs(rawInput, endpointId),
        challengeToken: requireToken(mfaChallengeToken, "MFA challenge"),
        request
      }));
    case "beginTotpEnrollment":
      return { body: await auth.beginTotpEnrollment({
        sessionToken: requireToken(sessionToken, "session"), request
      }) };
    case "confirmTotpEnrollment":
      return { body: await auth.confirmTotpEnrollment({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      }) };
    case "disableTotp":
      await auth.disableTotp({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      });
      return { body: { success: true } };
    case "regenerateRecoveryCodes":
      return { body: { recoveryCodes: await auth.regenerateRecoveryCodes({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      }) } };
    case "beginPasskeyRegistration":
      return { body: await auth.beginPasskeyRegistration({
        sessionToken: requireToken(sessionToken, "session"), request
      }) };
    case "completePasskeyRegistration": {
      const passkey = await auth.completePasskeyRegistration({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      });
      return { body: { passkey: serializePasskey(passkey) } };
    }
    case "beginPasskeyAuthentication": {
      const input = inputAs(rawInput, endpointId);
      return { body: await auth.beginPasskeyAuthentication({
        userId: input.userId,
        mfaChallengeToken: input.mfa
          ? requireToken(mfaChallengeToken, "MFA challenge")
          : undefined,
        request
      }) };
    }
    case "completePasskeyAuthentication":
      return completedMfaExecution(await auth.completePasskeyAuthentication({
        ...inputAs(rawInput, endpointId), request
      }));
    case "listPasskeys":
      return { body: { passkeys: (await auth.listPasskeys({
        sessionToken: requireToken(sessionToken, "session")
      })).map(serializePasskey) } };
    case "renamePasskey": {
      const passkey = await auth.renamePasskey({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      });
      return { body: { passkey: serializePasskey(passkey) } };
    }
    case "revokePasskey":
      await auth.revokePasskey({
        ...inputAs(rawInput, endpointId),
        sessionToken: requireToken(sessionToken, "session"),
        request
      });
      return { body: { success: true } };
  }
}

function signInExecution(result: SignInResult): EndpointExecution {
  if (result.status === "complete") return completedSessionExecution(result);
  return {
    body: serializeMfaRequired(result),
    setMfaChallenge: { token: result.challengeToken, expiresAt: result.expiresAt }
  };
}

function completedMfaExecution(result: SessionResult): EndpointExecution {
  return { ...completedSessionExecution(result), clearMfaChallenge: true };
}

function completedSessionExecution(result: SessionResult): EndpointExecution {
  return {
    body: serializeAuthSession(result),
    setSession: { token: result.sessionToken, expiresAt: result.session.expiresAt }
  };
}

function oauthExecution(result: OAuthCompletionResult): EndpointExecution {
  const callback = {
    destination: result.destination,
    interactionMode: result.interactionMode,
    openerOrigin: result.openerOrigin
  };
  if (result.status === "linked") {
    return { body: { status: "linked" }, oauthCallback: callback };
  }
  return { ...signInExecution(result), oauthCallback: callback };
}

async function completeOAuth(
  auth: OwnAuth,
  provider: "google" | "github" | "apple",
  rawInput: Record<string, unknown> | undefined,
  request: RequestContext
): Promise<OAuthCompletionResult> {
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(rawInput ?? {})) {
    if (typeof value === "string") parameters.append(name, value);
  }
  return auth.completeOAuthSignIn({ provider, callbackParameters: parameters, request });
}

function serializeMfaRequired(result: MfaRequiredResult): SignInPayload {
  return {
    status: "mfa_required",
    methods: [...result.methods],
    expiresAt: result.expiresAt.toISOString()
  };
}

function inputAs<Id extends OwnAuthEndpointId>(
  input: Record<string, unknown> | undefined,
  _endpointId: Id
): OwnAuthEndpointInputMap[Id] {
  return input as unknown as OwnAuthEndpointInputMap[Id];
}

function requireToken(token: string | null, kind: "session" | "MFA challenge"): string {
  if (!token) {
    const code = kind === "session" ? "invalid_session" : "mfa_challenge_invalid";
    throw new AuthError(code, `Invalid or expired ${kind}`, 401);
  }
  return token;
}
