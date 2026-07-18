import { describe, expect, it } from "vitest";
import {
  createOwnAuth,
  createOwnAuthHandler,
  InMemoryAuthStorage
} from "../../src/index.js";
import { SamlProtocolError } from "../../src/saml.js";
import { jsonRequest } from "../http-test-helpers.js";
import { createSamlHarness, required } from "./saml-test-harness.js";

const appOrigin = "https://app.example.com";

describe("SAML HTTP contract", () => {
  it("does not expose SAML routes when the feature is not configured", async () => {
    const handler = createOwnAuthHandler(createOwnAuth({
      storage: new InMemoryAuthStorage(),
      tokenPepper: "saml-disabled-http"
    }));

    const response = await handler(jsonRequest(
      "/api/auth/saml/start",
      { connectionId: "samlc_missing" }
    ));

    expect(response.status).toBe(404);
  });

  it("starts sign-in, serves metadata, and completes a form-post callback", async () => {
    const harness = await createSamlHarness();
    const handler = createOwnAuthHandler(harness.auth);
    const started = await handler(jsonRequest(
      "/api/auth/saml/start",
      {
        connectionId: harness.connection.id,
        destination: "/dashboard"
      },
      {},
      appOrigin
    ));
    const startBody = await started.json() as { url: string; expiresAt: string };

    expect(started.status).toBe(200);
    expect(new URL(startBody.url).origin).toBe("https://idp.example.com");
    expect(startBody.url).not.toContain("saml-test-pepper");

    const metadata = await handler(new Request(
      `${appOrigin}/api/auth/saml/metadata?connectionId=${harness.connection.id}`
    ));
    expect(metadata.status).toBe(200);
    expect(metadata.headers.get("content-type")).toContain("application/samlmetadata+xml");
    await expect(metadata.text()).resolves.toContain(harness.connection.id);

    const callback = await handler(formRequest({
      SAMLResponse: "signed-response",
      RelayState: required(harness.provider.relayState)
    }));
    const destination = new URL(required(callback.headers.get("location")));

    expect(callback.status).toBe(302);
    expect(destination.origin + destination.pathname).toBe(`${appOrigin}/dashboard`);
    expect(destination.searchParams.get("own_auth_status")).toBe("complete");
    expect(destination.search).not.toContain("signed-response");
    expect(destination.search).not.toContain(required(harness.provider.relayState));
    expect(callback.headers.get("set-cookie")).toContain("own_auth_session=");
  });

  it("keeps precise diagnostics server-side and redirects with a generic error", async () => {
    const harness = await createSamlHarness();
    const reported: unknown[] = [];
    const handler = createOwnAuthHandler(harness.auth, {
      onError(error) {
        reported.push(error);
      }
    });
    await handler(jsonRequest(
      "/api/auth/saml/start",
      { connectionId: harness.connection.id, destination: "/sign-in" },
      {},
      appOrigin
    ));
    harness.provider.failure = new SamlProtocolError(
      "saml_signature_algorithm_unsupported",
      "SAML response uses an unsupported signature algorithm"
    );

    const callback = await handler(formRequest({
      SAMLResponse: "signed-response",
      RelayState: required(harness.provider.relayState)
    }));
    const destination = new URL(required(callback.headers.get("location")));

    expect(callback.status).toBe(302);
    expect(destination.searchParams.get("own_auth_status")).toBe("failure");
    expect(destination.searchParams.get("own_auth_error")).toBe("saml_response_invalid");
    expect(reported).toEqual([
      expect.objectContaining({ code: "saml_signature_algorithm_unsupported" })
    ]);
  });

  it("accepts callbacks only as bounded form data", async () => {
    const harness = await createSamlHarness();
    const handler = createOwnAuthHandler(harness.auth);

    const wrongType = await handler(new Request(`${appOrigin}/api/auth/saml/acs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ SAMLResponse: "response", RelayState: "state" })
    }));
    expect(wrongType.status).toBe(415);

    const oversized = await handler(formRequest({
      SAMLResponse: "A".repeat(70 * 1024),
      RelayState: "state"
    }));
    expect(oversized.status).toBe(413);
  });
});

function formRequest(values: Record<string, string>): Request {
  return new Request(`${appOrigin}/api/auth/saml/acs`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values)
  });
}
