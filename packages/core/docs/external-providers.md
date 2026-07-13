# External Providers

Sign users in with an identity that your backend has already verified with Apple or Google.

## Verify first

Own Auth does not verify provider tokens inside `signInWithVerifiedExternalIdentity`. The method is a trusted assertion boundary.

Before calling it, the provider integration must verify the token's signature, issuer, audience, expiry, and nonce where required. Never pass claims from an unverified JWT, browser payload, or mobile-client payload.

## Create the Own Auth session

```ts
const identity = await googleProvider.verifyIdToken(idToken);

const { user, session, sessionToken } =
  await auth.signInWithVerifiedExternalIdentity({
    provider: "google",
    providerAccountId: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    imageUrl: identity.imageUrl,
  });
```

The name is deliberately explicit: the argument must be a verified external identity, not merely an external provider token or decoded set of claims.

Own Auth then links the provider account, creates or finds the user, creates a session, and writes the audit events. A new provider link with an email requires the provider to assert that the email is verified.

## Provider adapters

Keep provider verification behind an adapter in the application or a dedicated Own Auth provider package:

```ts
interface ExternalIdentityProvider {
  verifyIdToken(token: string): Promise<{
    subject: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    imageUrl?: string;
  }>;
}
```

The adapter owns provider-specific SDK calls. The Own Auth core only receives the normalized, verified identity.
