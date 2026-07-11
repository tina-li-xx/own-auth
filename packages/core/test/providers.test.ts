import { describe, expect, it, vi } from "vitest";
import { OwnAuthManagedEmailProvider } from "../src/index.js";

describe("OwnAuthManagedEmailProvider", () => {
  it("uses the Own Auth managed delivery endpoint by default", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }) as Response);
    const provider = new OwnAuthManagedEmailProvider({
      deliveryKey: "delivery_key",
      fetch
    });

    await provider.send({
      to: "user@example.com",
      type: "magic_link",
      token: "raw-token",
      url: "https://app.example.com/auth/magic-link/verify?token=raw-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.own-auth.com/v1/email",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends email delivery requests without posting the raw token separately", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 202 }) as Response);
    const provider = new OwnAuthManagedEmailProvider({
      deliveryKey: "delivery_key",
      endpoint: "https://delivery.example.com/v1/email",
      fetch
    });

    await provider.send({
      to: "user@example.com",
      type: "magic_link",
      token: "raw-token",
      url: "https://app.example.com/auth/magic-link/verify?token=raw-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z")
    });

    const [, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(fetch).toHaveBeenCalledWith(
      "https://delivery.example.com/v1/email",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer delivery_key",
          "content-type": "application/json"
        }
      })
    );
    expect(body).toEqual({
      to: "user@example.com",
      type: "magic_link",
      url: "https://app.example.com/auth/magic-link/verify?token=raw-token",
      expiresAt: "2026-01-01T00:00:00.000Z"
    });
    expect(body.token).toBeUndefined();
  });

  it("includes managed delivery error details when the endpoint returns a safe error body", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: "bad_request",
          message: "url is not allowed for this delivery project."
        }
      })
    }) as Response);
    const provider = new OwnAuthManagedEmailProvider({
      deliveryKey: "delivery_key",
      fetch
    });

    await expect(
      provider.send({
        to: "user@example.com",
        type: "magic_link",
        token: "raw-token",
        url: "myapp://app/auth/magic-link/verify?token=raw-token",
        expiresAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ).rejects.toThrow(
      "Own Auth managed email delivery failed with status 400: bad_request - url is not allowed for this delivery project."
    );
  });

  it("keeps the generic status error when the endpoint error body is not structured", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("invalid json");
      }
    }) as unknown as Response);
    const provider = new OwnAuthManagedEmailProvider({
      deliveryKey: "delivery_key",
      fetch
    });

    await expect(
      provider.send({
        to: "user@example.com",
        type: "magic_link",
        token: "raw-token",
        url: "https://app.example.com/auth/magic-link/verify?token=raw-token",
        expiresAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ).rejects.toThrow("Own Auth managed email delivery failed with status 502.");
  });

  it("sanitizes managed delivery error details before throwing", async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: "bad_request\nwith_newline",
          message: `invalid url\n${"x".repeat(260)}`
        }
      })
    }) as Response);
    const provider = new OwnAuthManagedEmailProvider({
      deliveryKey: "delivery_key",
      fetch
    });

    await expect(
      provider.send({
        to: "user@example.com",
        type: "magic_link",
        token: "raw-token",
        url: "myapp://app/auth/magic-link/verify?token=raw-token",
        expiresAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ).rejects.toThrow(
      /^Own Auth managed email delivery failed with status 400: bad_request with_newline - invalid url x+\.$/
    );
  });

  it("requires a delivery key", () => {
    expect(
      () => new OwnAuthManagedEmailProvider({ deliveryKey: "" })
    ).toThrow("Own Auth managed email delivery requires a delivery key.");
  });
});
