import { afterEach, describe, expect, it } from "vitest";
import { createOwnAuthClient } from "../../src/client.js";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("SAML client", () => {
  it.each([
    ["signInWithSaml", "sign_in"],
    ["linkSaml", "link"]
  ] as const)("starts and navigates the %s flow", async (method, intent) => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const destinations: string[] = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://app.example.com",
          assign(url: string) {
            destinations.push(url);
          }
        }
      }
    });
    const client = createOwnAuthClient({
      baseURL: "https://app.example.com/api/auth",
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input instanceof Request ? input.url : input.toString(),
          body: JSON.parse(String(init?.body))
        });
        return Response.json({
          url: "https://idp.example.com/sso?SAMLRequest=request",
          expiresAt: "2026-07-18T12:00:00.000Z"
        });
      }) as typeof fetch
    });

    await client[method]({
      connectionId: "samlc_example",
      destination: "/dashboard"
    });

    expect(calls).toEqual([{
      url: "https://app.example.com/api/auth/saml/start",
      body: {
        connectionId: "samlc_example",
        destination: "/dashboard",
        intent
      }
    }]);
    expect(destinations).toEqual([
      "https://idp.example.com/sso?SAMLRequest=request"
    ]);
  });
});
