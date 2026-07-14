# OAuth Transaction Derivation

This note documents an intentional difference from OAuth implementations that store state, PKCE verifier, and nonce as separate database values.

Own Auth generates one 256-bit random OAuth state value. It stores only the peppered hash of that state. The raw state is returned to the browser and comes back through the provider callback.

The PKCE verifier and OIDC nonce are deterministic HMAC-SHA256 derivations of the raw state:

```text
PKCE verifier = HMAC(raw state, "own-auth:oauth:pkce:v1")
OIDC nonce    = HMAC(raw state, "own-auth:oauth:nonce:v1")
```

The domain labels make the values independent. The verifier and nonce are intentionally never persisted, which removes two callback secrets from storage without weakening their entropy.

At callback time Own Auth:

1. hashes the returned raw state with the token pepper
2. atomically consumes the matching transaction
3. rejects missing, expired, consumed, or provider-mismatched transactions
4. re-derives the PKCE verifier and nonce from the raw state
5. exchanges the authorization code and verifies the provider response

State is consumed before code exchange. A failed provider exchange therefore burns that transaction and cannot be replayed.

Do not replace this helper with stored verifier or nonce columns unless the transaction threat model and migration contract are deliberately changed.
