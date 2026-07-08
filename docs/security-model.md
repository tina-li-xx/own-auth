# Security Model

## Secret Storage

- session tokens
- magic link tokens
- email verification tokens
- password reset tokens
- SMS OTP codes
- API keys

Raw API keys are returned only once at creation. Raw email/SMS tokens are only exposed when `exposeRawTokens` is enabled for local development.

## Passwords

Passwords are hashed with Node's `scrypt` using per-password random salts.

## Sessions

- token hash
- expiry time
- idle expiry time
- IP address
- user agent
- revocation metadata

## Tokens

- token hash
- token type
- expiry
- unused status

Used tokens are marked consumed.

## Account Enumeration

Password reset and email verification requests return safe generic success responses when no matching user exists.

## Rate Limits

- Sensitive actions pass through the rate-limit interface.
- Production deployments require a Redis-compatible implementation.

## Audit Events

- signup
- login
- logout
- session revocation
- token requests
- password changes
- API key usage
- organisation changes
- invites
- role changes
