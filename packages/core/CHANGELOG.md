# Changelog

## 0.3.0

### Breaking changes

- Node.js 20 or later is now required by the current SimpleWebAuthn server package used for passkeys. Cloudflare Workers remain supported with the `nodejs_compat` compatibility flag.
- First-factor sign-in methods now return a `SignInResult` discriminated union. Check `status` before reading `user`, `session`, or `sessionToken`. Users without MFA still receive `status: "complete"` immediately.
- `signUpEmailPassword` still completes immediately and keeps its existing session result shape because a newly created user cannot already have MFA factors.
- Applications using the HTTP handler must use its temporary HttpOnly MFA cookie when a sign-in returns `status: "mfa_required"`.
- Custom `AuthStorage` adapters must implement the new OAuth transaction, MFA, encrypted credential, passkey, WebAuthn challenge, and related atomic operations before using `0.3.0`.

### Added

- Google, GitHub, and Apple redirect OAuth with PKCE, nonce verification, atomic state consumption, explicit account linking, and popup support.
- Google One Tap with a stored, single-use nonce transaction.
- TOTP MFA, one-time recovery codes, MFA challenges, and session assurance levels.
- Optional encrypted OAuth refresh credentials with key rotation and server-only access-token refresh.
- Passkey registration, primary sign-in, MFA completion, listing, renaming, and revocation.
- A public plugin contract with namespaced routes, hooks, rate limits, migrations, OpenAPI output, and client fingerprints.
- Migrations `003_oauth_transactions` through `007_plugin_migrations`.

### Security

- OAuth state, One Tap nonces, MFA challenges, recovery codes, and WebAuthn challenges are consumed atomically.
- TOTP timesteps and passkey counters use atomic comparison updates to reject replay and concurrent reuse.
- Provider refresh tokens and TOTP secrets use purpose-separated AES-256-GCM encryption through the shared encryption key ring.
- Disabling TOTP invalidates its recovery codes, including codes attached to an outstanding MFA challenge.
- HTTP request body limits are enforced while streaming, including Apple's 64 KiB form-post callback limit.
- Generated plugin clients reject missing or mismatched server contract fingerprints.
- Browser OAuth popups exchange only completion state. OAuth codes, provider tokens, session tokens, and MFA challenge tokens are never sent through `postMessage`.

The trusted `signInWithVerifiedExternalIdentity` flow remains available for native provider SDKs and other integrations that verify provider credentials before calling Own Auth.
