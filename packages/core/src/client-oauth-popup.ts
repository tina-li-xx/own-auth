import type {
  AuthSessionPayload,
  MfaRequiredPayload,
  OwnAuthHttpErrorCode
} from "./http/contract.js";
import { OwnAuthClientError } from "./client-error.js";

export type OAuthPopupResult =
  | AuthSessionPayload
  | MfaRequiredPayload
  | { status: "linked" };

interface PopupWindow {
  closed: boolean;
  close(): void;
  location: { replace(url: string): void };
}

interface BrowserWindow {
  location: { origin: string; assign(url: string): void };
  open(url?: string, target?: string, features?: string): PopupWindow | null;
  addEventListener(type: "message", listener: (event: PopupMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: PopupMessageEvent) => void): void;
  setInterval(handler: () => void, timeout: number): number;
  clearInterval(id: number): void;
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

interface PopupMessageEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

interface PopupMessage {
  source: "own-auth";
  type: "oauth";
  status: "complete" | "mfa_required" | "linked" | "failure";
  methods?: MfaRequiredPayload["methods"];
  expiresAt?: string;
  error?: { code: string; message: string };
}

export function getBrowserOrigin(): string {
  return requireBrowser().location.origin;
}

export function navigateBrowser(url: string): void {
  requireBrowser().location.assign(url);
}

export function runOAuthPopup(
  start: () => Promise<{ url: string }>,
  loadSession: () => Promise<AuthSessionPayload | null>,
  expectedMessageOrigin: string,
  timeoutMs = 120_000
): Promise<OAuthPopupResult> {
  const browser = requireBrowser();
  const popup = browser.open("", "own-auth-oauth", popupFeatures());
  if (!popup) {
    return Promise.reject(new OwnAuthClientError(
      "oauth_provider_error",
      "The sign-in popup was blocked",
      400
    ));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let messageReceived = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      browser.removeEventListener("message", onMessage);
      browser.clearTimeout(timeout);
      browser.clearInterval(closedCheck);
      callback();
    };
    const fail = (error: OwnAuthClientError): void => finish(() => {
      popup.close();
      reject(error);
    });
    const onMessage = (event: PopupMessageEvent): void => {
      if (settled || messageReceived) return;
      if (event.origin !== expectedMessageOrigin || event.source !== popup) return;
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.status === "failure") {
        fail(new OwnAuthClientError(
          (message.error?.code as OwnAuthHttpErrorCode | undefined) ?? "oauth_provider_error",
          message.error?.message ?? "OAuth sign-in failed",
          400
        ));
        return;
      }
      if (message.status === "mfa_required") {
        if (!message.methods || !message.expiresAt) {
          fail(invalidPopupResponse());
          return;
        }
        finish(() => resolve({
          status: "mfa_required",
          methods: message.methods as MfaRequiredPayload["methods"],
          expiresAt: message.expiresAt as string
        }));
        return;
      }
      if (message.status === "linked") {
        finish(() => resolve({ status: "linked" }));
        return;
      }
      messageReceived = true;
      browser.clearInterval(closedCheck);
      void loadSession().then((session) => {
        if (!session) {
          fail(invalidPopupResponse());
          return;
        }
        finish(() => resolve(session));
      }, (error: unknown) => fail(asClientError(error)));
    };
    const timeout = browser.setTimeout(() => fail(new OwnAuthClientError(
      "oauth_provider_error",
      "OAuth sign-in timed out",
      408
    )), timeoutMs);
    const closedCheck = browser.setInterval(() => {
      if (popup.closed && !messageReceived) {
        fail(new OwnAuthClientError(
          "oauth_provider_error",
          "The sign-in popup was closed",
          400
        ));
      }
    }, 250);

    browser.addEventListener("message", onMessage);
    void start().then(
      ({ url }) => {
        if (settled) return;
        try {
          popup.location.replace(url);
        } catch {
          fail(new OwnAuthClientError(
            "oauth_provider_error",
            "The sign-in popup could not be opened",
            400
          ));
        }
      },
      (error: unknown) => fail(asClientError(error))
    );
  });
}

function parseMessage(value: unknown): PopupMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PopupMessage>;
  if (candidate.source !== "own-auth" || candidate.type !== "oauth") return null;
  if (!["complete", "mfa_required", "linked", "failure"].includes(candidate.status ?? "")) {
    return null;
  }
  return candidate as PopupMessage;
}

function requireBrowser(): BrowserWindow {
  const browser = (globalThis as { window?: BrowserWindow }).window;
  if (!browser) {
    throw new OwnAuthClientError(
      "oauth_provider_error",
      "OAuth browser mode requires a browser window",
      400
    );
  }
  return browser;
}

function invalidPopupResponse(): OwnAuthClientError {
  return new OwnAuthClientError(
    "internal_error",
    "Own Auth returned an invalid popup response",
    500
  );
}

function asClientError(error: unknown): OwnAuthClientError {
  return error instanceof OwnAuthClientError
    ? error
    : new OwnAuthClientError("oauth_provider_error", "OAuth sign-in failed", 400);
}

function popupFeatures(): string {
  return "popup=yes,width=500,height=650,resizable=yes,scrollbars=yes";
}
