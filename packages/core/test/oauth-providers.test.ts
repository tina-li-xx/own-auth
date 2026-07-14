import { describe, expect, it } from "vitest";
import { loadGitHubIdentity } from "../src/oauth-providers.js";

describe("OAuth provider identity normalization", () => {
  it("uses GitHub's verified primary email before every other address", async () => {
    const identity = await loadGitHubIdentity("access", githubFetch([
      { email: "z@example.com", verified: true, primary: false },
      { email: "Primary@Example.com", verified: true, primary: true },
      { email: "a@example.com", verified: true, primary: false }
    ]));

    expect(identity.email).toBe("primary@example.com");
    expect(identity.emailVerified).toBe(true);
  });

  it("uses the first verified GitHub email after deterministic lowercase sorting", async () => {
    const identity = await loadGitHubIdentity("access", githubFetch([
      { email: "z@example.com", verified: true },
      { email: "B@example.com", verified: false },
      { email: "A@example.com", verified: true }
    ]));

    expect(identity.email).toBe("a@example.com");
  });

  it("keeps a GitHub identity usable when the email endpoint is unavailable", async () => {
    const identity = await loadGitHubIdentity("access", githubFetch([], 503));

    expect(identity).toMatchObject({
      provider: "github",
      providerAccountId: "42",
      email: null,
      emailVerified: false
    });
  });
});

function githubFetch(
  emails: Array<{ email: string; verified: boolean; primary?: boolean }>,
  emailStatus = 200
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.endsWith("/user/emails")) {
      return Response.json(emails, { status: emailStatus });
    }
    return Response.json({
      id: 42,
      login: "octocat",
      name: "Octo Cat",
      avatar_url: "https://avatars.example.com/42"
    });
  }) as typeof fetch;
}
