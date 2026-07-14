import type { OwnAuthClient } from "./client.js";
import { OwnAuthClientError } from "./client-error.js";
import type { SignInPayload } from "./http/contract.js";

export interface GoogleOneTapBrowserOptions {
  clientId: string;
  google?: GoogleIdentityServices;
  context?: "signin" | "signup" | "use";
  cancelOnTapOutside?: boolean;
}

export interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        context?: "signin" | "signup" | "use";
        cancel_on_tap_outside?: boolean;
        callback(response: { credential?: string }): void;
      }): void;
      prompt(callback?: (notification: GooglePromptNotification) => void): void;
      cancel(): void;
    };
  };
}

export interface GooglePromptNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  getNotDisplayedReason?(): string;
  getSkippedReason?(): string;
}

export async function signInWithGoogleOneTap(
  client: OwnAuthClient,
  options: GoogleOneTapBrowserOptions
): Promise<SignInPayload> {
  const google = options.google ?? browserGoogle();
  const prepared = await client.prepareGoogleOneTap();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      callback();
    };
    google.accounts.id.initialize({
      client_id: options.clientId,
      nonce: prepared.nonce,
      context: options.context,
      cancel_on_tap_outside: options.cancelOnTapOutside,
      callback: ({ credential }) => {
        if (!credential) {
          finish(() => reject(oneTapError("Google did not return a credential")));
          return;
        }
        void client.signInWithGoogleOneTap({
          credential,
          nonce: prepared.nonce
        }).then(
          (result) => finish(() => resolve(result)),
          (error: unknown) => finish(() => reject(error))
        );
      }
    });
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const reason = notification.getNotDisplayedReason?.()
          ?? notification.getSkippedReason?.()
          ?? "Google One Tap was unavailable";
        finish(() => reject(oneTapError(reason)));
      }
    });
  });
}

export function cancelGoogleOneTap(google?: GoogleIdentityServices): void {
  (google ?? browserGoogle()).accounts.id.cancel();
}

function browserGoogle(): GoogleIdentityServices {
  const google = (globalThis as { google?: GoogleIdentityServices }).google;
  if (!google) {
    throw oneTapError("Load Google Identity Services before using Google One Tap");
  }
  return google;
}

function oneTapError(message: string): OwnAuthClientError {
  return new OwnAuthClientError("oauth_provider_error", message, 400);
}
