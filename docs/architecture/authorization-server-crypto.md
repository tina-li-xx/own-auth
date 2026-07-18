# Authorization Server Cryptography

Authorization interactions store only a hash of the browser-visible interaction token.

The request payload and OIDC nonce use the shared encryption key ring with a dedicated HKDF label:

```text
own-auth:authorization-request:v1
```

Authenticated metadata separates full authorization requests from OIDC nonce records. This purpose must not be reused for TOTP secrets or external-provider refresh credentials.

ID tokens use RS256. The current private key signs new tokens. JWKS publishes the current public key and configured previous public keys.

Access and refresh tokens are opaque random values. Only peppered hashes are stored.

DPoP stores the RFC 7638 public-key thumbprint on the authorization code, access token, and refresh token. The client private key and proof JWT are never stored by Own Auth.

Proof replay protection stores only a peppered hash of this domain-separated value:

```text
own-auth:dpop-proof:v1:{jwk-thumbprint}:{proof-id}
```

The proof signature, key thumbprint, method, canonical URL, timestamp, and access-token hash are all verified before the replay hash is inserted. In particular, `ath` validation must stay before replay consumption. Moving consumption earlier would let an invalid proof burn a legitimate proof ID.

The replay row starts its retention window at the later of proof consumption time and the accepted proof issue time, then adds `proofTtlMs` plus `clockSkewMs`. This keeps a proof ID reserved for every timestamp the verifier can still accept, including proofs issued slightly ahead within permitted clock skew.

Refresh rotation is a storage-level atomic operation. Reuse revokes the grant and every access and refresh token in its family, including a replacement token created by a concurrent winning request.
