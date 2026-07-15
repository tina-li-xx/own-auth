import type { OAuthProviderAdapter } from "../../src/oauth-types.js";

export function createConformanceGoogleProvider(): OAuthProviderAdapter {
  return {
    provider: "google",
    redirectUri: "https://api.example.com/auth/oauth/google/callback",
    offlineAccess: false,
    async createAuthorizationUrl(input) {
      const url = new URL("https://accounts.example.test/authorize");
      url.searchParams.set("state", input.state);
      return url;
    },
    async exchangeCode() {
      return {
        identity: {
          provider: "google",
          providerAccountId: "unused-conformance-account",
          email: "unused@example.com",
          emailVerified: true,
          name: null,
          imageUrl: null
        },
        refreshToken: null,
        scopes: []
      };
    }
  };
}
