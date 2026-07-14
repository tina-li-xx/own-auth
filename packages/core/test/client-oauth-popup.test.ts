import { afterEach, describe, expect, it } from "vitest";
import type { AuthSessionPayload } from "../src/http/contract.js";
import { runOAuthPopup } from "../src/client-oauth-popup.js";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("OAuth popup client", () => {
  it("opens synchronously and waits for the session after the popup closes", async () => {
    const browser = installBrowser();
    let resolveSession!: (session: AuthSessionPayload) => void;
    const session = { status: "complete" } as AuthSessionPayload;
    const sessionRequest = new Promise<AuthSessionPayload>((resolve) => {
      resolveSession = resolve;
    });

    const result = runOAuthPopup(
      async () => ({ url: "https://accounts.example.com/authorize" }),
      () => sessionRequest,
      "https://api.example.com"
    );

    await flushPromises();
    expect(browser.popup.locationValue).toBe("https://accounts.example.com/authorize");
    browser.emit({ source: "own-auth", type: "oauth", status: "complete" });
    browser.popup.closed = true;
    browser.runIntervals();
    resolveSession(session);

    await expect(result).resolves.toBe(session);
    expect(browser.listener).toBeNull();
    expect(browser.timerCount).toBe(0);
  });

  it("rejects blocked and user-closed popups", async () => {
    const blocked = installBrowser(true);
    await expect(runOAuthPopup(
      async () => ({ url: "https://accounts.example.com/authorize" }),
      async () => null,
      "https://api.example.com"
    )).rejects.toMatchObject({ message: "The sign-in popup was blocked" });
    expect(blocked.listener).toBeNull();

    const closed = installBrowser();
    const result = runOAuthPopup(
      () => new Promise<{ url: string }>(() => undefined),
      async () => null,
      "https://api.example.com"
    );
    closed.popup.closed = true;
    closed.runIntervals();
    await expect(result).rejects.toMatchObject({ message: "The sign-in popup was closed" });
  });

  it("returns provider failures and enforces the timeout", async () => {
    const providerFailure = installBrowser();
    const failed = runOAuthPopup(
      async () => ({ url: "https://accounts.example.com/authorize" }),
      async () => null,
      "https://api.example.com"
    );
    await flushPromises();
    providerFailure.emit({
      source: "own-auth",
      type: "oauth",
      status: "failure",
      error: { code: "oauth_provider_error", message: "Provider rejected sign-in" }
    });
    await expect(failed).rejects.toMatchObject({ message: "Provider rejected sign-in" });

    const timedOut = installBrowser();
    const pending = runOAuthPopup(
      () => new Promise<{ url: string }>(() => undefined),
      async () => null,
      "https://api.example.com"
    );
    timedOut.runTimeouts();
    await expect(pending).rejects.toMatchObject({ message: "OAuth sign-in timed out" });
  });

  it("ignores messages from the wrong origin or window", async () => {
    const browser = installBrowser();
    const result = runOAuthPopup(
      async () => ({ url: "https://accounts.example.com/authorize" }),
      async () => ({ status: "complete" } as AuthSessionPayload),
      "https://api.example.com"
    );
    await flushPromises();

    browser.emit(
      { source: "own-auth", type: "oauth", status: "complete" },
      "https://attacker.example.com"
    );
    browser.emit(
      { source: "own-auth", type: "oauth", status: "complete" },
      "https://api.example.com",
      {}
    );
    expect(browser.listener).not.toBeNull();

    browser.emit({ source: "own-auth", type: "oauth", status: "complete" });
    await expect(result).resolves.toMatchObject({ status: "complete" });
  });
});

function installBrowser(blocked = false): FakeBrowser {
  const browser = new FakeBrowser(blocked);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browser
  });
  return browser;
}

class FakeBrowser {
  readonly location = { origin: "https://app.example.com", assign: () => undefined };
  readonly popup = {
    closed: false,
    locationValue: "",
    close() {
      this.closed = true;
    },
    location: {
      replace: (url: string) => {
        this.popup.locationValue = url;
      }
    }
  };
  listener: ((event: { origin: string; source: unknown; data: unknown }) => void) | null = null;
  private nextTimerId = 1;
  private readonly intervals = new Map<number, () => void>();
  private readonly timeouts = new Map<number, () => void>();

  constructor(private readonly blocked: boolean) {}

  get timerCount(): number {
    return this.intervals.size + this.timeouts.size;
  }

  open() {
    return this.blocked ? null : this.popup;
  }

  addEventListener(_type: "message", listener: NonNullable<FakeBrowser["listener"]>): void {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: NonNullable<FakeBrowser["listener"]>): void {
    if (this.listener === listener) this.listener = null;
  }

  setInterval(handler: () => void): number {
    const id = this.nextTimerId++;
    this.intervals.set(id, handler);
    return id;
  }

  clearInterval(id: number): void {
    this.intervals.delete(id);
  }

  setTimeout(handler: () => void): number {
    const id = this.nextTimerId++;
    this.timeouts.set(id, handler);
    return id;
  }

  clearTimeout(id: number): void {
    this.timeouts.delete(id);
  }

  emit(data: unknown, origin = "https://api.example.com", source: unknown = this.popup): void {
    this.listener?.({ origin, source, data });
  }

  runIntervals(): void {
    for (const handler of [...this.intervals.values()]) handler();
  }

  runTimeouts(): void {
    for (const handler of [...this.timeouts.values()]) handler();
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
