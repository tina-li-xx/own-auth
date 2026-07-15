# Security Policy

Own Auth handles authentication, sessions, API keys, account recovery, and
authorization. Report suspected vulnerabilities privately so maintainers can
investigate and release a fix before technical details become public.

## Scope

This policy covers the `own-auth` npm package and source code in this repository,
including:

- authentication and account-recovery flows
- sessions, cookies, and the HTTP handler
- Postgres, Cloudflare D1, and in-memory adapters
- OAuth, MFA, recovery codes, and passkeys
- organisations, permissions, API keys, plugins, and webhooks
- browser clients and framework integrations shipped from this repository

Vulnerabilities in an application that integrates Own Auth, a hosting platform,
an OAuth provider, or an email or SMS provider are outside this repository's
control. If responsibility is unclear, report the issue privately here and the
maintainers will help identify the affected boundary.

## Reporting a Vulnerability

Do not open a public issue, discussion, pull request, or social-media post for an
undisclosed vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/own-auth/own-auth/security/advisories/new).
A GitHub account is required.

Include:

- the affected package version or commit
- the affected runtime and storage adapter
- the affected authentication or authorization flow
- the smallest reliable reproduction
- the security impact and required attacker access
- any known workaround or mitigation

Use test accounts and synthetic data. Never include live passwords, session
tokens, API keys, one-time codes, encryption keys, provider credentials, or
private user data.

## Supported Versions

| Release line | Security support |
|---|---|
| Current stable minor line | Supported through new patch releases |
| Older stable minor lines | Unsupported; upgrade to the current stable line |
| `next` prereleases | Testing only; fixes move forward to a later prerelease |
| Unreleased `main` | Reports accepted; not a production support line |

Own Auth is currently pre-1.0. A new stable minor release can contain breaking
changes and becomes the supported line when published to npm's `latest` tag.
Applications must use the newest patch release in that line to receive every
available security fix.

Own Auth does not currently provide long-term-support release lines. Maintainers
may make an exceptional backport for a critical issue, but users must not rely on
backports to unsupported versions.

## Response Targets

Maintainers aim to:

- acknowledge a complete report within three business days
- provide an initial assessment within seven business days
- provide an update at least every fourteen days while work remains active

These are response targets, not guaranteed service-level agreements. Complex
issues, incomplete reproductions, and coordinated fixes across dependencies may
take longer.

## Severity

Severity is based on exploitability, required access, affected users, and impact:

- **Critical:** unauthenticated account or session compromise, cross-tenant
  access, remote arbitrary code execution, or broad disclosure of raw secrets
- **High:** authentication or authorization bypass, privilege escalation, MFA
  bypass, replay of a single-use credential, or exposure of an auth token through
  an unsafe redirect
- **Moderate:** a security control bypass with substantial prerequisites, a
  bounded denial of service, or a default that materially weakens protection
- **Low:** hardening work or limited information exposure without direct account
  compromise

The published GitHub advisory may include a CVSS score when that improves the
description of a confirmed vulnerability.

## Maintainer Process

For a confirmed vulnerability, maintainers will:

1. reproduce the issue privately and identify affected versions, adapters, and
   runtimes
2. determine severity, available mitigations, and whether a CVE is appropriate
3. develop the smallest safe fix in the private advisory workspace
4. add a regression test for the failure mode and check related flows for the
   same vulnerability class
5. run the complete release gates against every affected durable adapter and
   supported runtime
6. publish the fixed package before publishing exploit details
7. publish the advisory with affected versions, patched versions, impact,
   mitigation, and upgrade guidance

Raw credentials, private user data, and unnecessary exploit details must not be
copied into commits, test fixtures, changelogs, or public advisories.

## Security Releases

- Stable fixes increment the patch version and publish through
  `pnpm release:stable` to npm's `latest` tag.
- Prerelease fixes increment the `x.y.z-next.n` version and publish through
  `pnpm release:next` without changing `latest`.
- A fix for unreleased code lands before the affected feature reaches a stable or
  prerelease package.
- Fixes that require schema changes include an idempotent migration and explicit
  upgrade guidance.
- `CHANGELOG.md` records the user-visible security effect without exposing raw
  secrets or avoidable exploit instructions.
- Maintainers may deprecate a vulnerable npm version when a specific upgrade path
  is available.

The release scripts verify npm state before creating the matching Git tag. If npm
publishing succeeds but verification or tagging is interrupted, maintainers use
`pnpm release:verify` and `pnpm release:tag` instead of republishing an immutable
version.

## Coordinated Disclosure

The reporter and maintainers should keep the report private until a fixed package
or an agreed mitigation is available. The public advisory should state:

- affected and patched versions
- impact and required attacker access
- mitigation and upgrade steps
- acknowledgement of the reporter, when requested

If details are disclosed publicly before a fix exists, move further technical
discussion into the private advisory and prioritize a safe patch. Public pressure
does not justify skipping regression coverage or release verification.
