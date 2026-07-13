import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnAuthClient } from "../src/client.js";
import { createOwnAuthReactClient } from "../src/react.js";

describe("createOwnAuthReactClient", () => {
  it("adds React session bindings to the framework-neutral client", () => {
    const client = createOwnAuthReactClient();

    expect(client).toBeInstanceOf(OwnAuthClient);
    expect(client.useSession).toBeTypeOf("function");
    expect(client.signInEmailPassword).toBeTypeOf("function");
  });

  it("renders the shared session snapshot through the React hook", () => {
    const client = createOwnAuthReactClient();

    function SessionState() {
      const session = client.useSession();
      return createElement("span", null, session.isPending ? "Loading" : "Ready");
    }

    expect(renderToString(createElement(SessionState))).toContain("Loading");
  });
});
