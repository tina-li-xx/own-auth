# Observability

Own Auth emits OpenTelemetry traces and metrics through `@opentelemetry/api`. If the application has not configured an OpenTelemetry SDK, the API remains a no-op and authentication behavior is unchanged.

There is no telemetry option in `createOwnAuth()`. Configure tracing and metrics once in the application or platform runtime. The application's OpenTelemetry SDK controls sampling, processors, exporters, and destinations.

Initialize the application's OpenTelemetry SDK before starting the server so Own Auth telemetry uses the same providers and trace context as the rest of the application.

## Traces

Direct server-side calls produce one core operation span:

```text
own-auth.operation signInEmailPassword
```

Requests through `createOwnAuthHandler()` produce a handler span with the core operation nested beneath it:

```text
own-auth.http signInEmailPassword
  own-auth.operation signInEmailPassword
```

The HTTP handler records the fixed endpoint ID, request method, route template, response status, and outcome. It does not record the requested URL, query string, headers, cookies, or body.

Own Auth also emits spans around:

- email and SMS delivery provider calls
- Google, GitHub, and Apple provider calls
- plugin methods and endpoints

These spans identify the fixed operation or configured plugin contract. They do not include provider credentials, delivery contents, plugin input, or plugin output.

Failed spans use the typed Own Auth error code as `error.type` when it is safe. Own Auth does not record exception messages, stack traces, or exception events because authentication errors can contain application or provider details.

## Metrics

| Metric | Unit | Attributes |
|---|---|---|
| `own_auth.operation.count` | `{operation}` | `own_auth.operation.name`, `own_auth.operation.outcome` |
| `own_auth.operation.duration` | `s` | `own_auth.operation.name`, `own_auth.operation.outcome` |
| `own_auth.delivery.count` | `{delivery}` | `own_auth.delivery.channel`, `own_auth.delivery.type`, `own_auth.delivery.outcome` |
| `own_auth.delivery.duration` | `s` | `own_auth.delivery.channel`, `own_auth.delivery.type`, `own_auth.delivery.outcome` |
| `own_auth.rate_limit.denial.count` | `{denial}` | `own_auth.rate_limit.bucket` |

Metric attributes use bounded labels. Rate-limit keys, user identifiers, recipient addresses, and other dynamic values are never metric attributes.

## Data Safety

Own Auth telemetry never records:

- email addresses, phone numbers, names, IP addresses, or user agents
- passwords, session tokens, API keys, one-time tokens, SMS codes, or TOTP secrets
- OAuth codes, provider tokens, credentials, or WebAuthn responses
- request or redirect URLs, query strings, headers, cookies, or bodies
- email or SMS contents
- database statements, parameters, rows, or storage adapter inputs
- error messages or stack traces

AuthStorage and rate-limit adapter calls are not instrumented. Database telemetry, if added later, belongs in a separate integration with its own query and parameter filtering rules.

Own Auth does not emit browser, React, or OpenTelemetry log signals. Browser monitoring and application logging remain application concerns.

## Cloudflare Workers

The runtime package depends only on the worker-compatible `@opentelemetry/api`. OpenTelemetry SDK packages are development dependencies used by Own Auth's telemetry tests and are not loaded by applications using the package.

The Cloudflare compatibility check bundles the real Worker fixture and completes authentication flows with no OpenTelemetry SDK configured. This verifies that the no-op telemetry path remains compatible with Workers.
