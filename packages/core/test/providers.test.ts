import { describe, expect, it, vi } from "vitest";
import { OwnAuthManagedEmailProvider } from "../src/index.js";

describe("OwnAuthManagedEmailProvider", () => {
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

  it("requires a delivery key", () => {
    expect(
      () => new OwnAuthManagedEmailProvider({ deliveryKey: "" })
    ).toThrow("Own Auth managed email delivery requires a delivery key.");
  });
});
