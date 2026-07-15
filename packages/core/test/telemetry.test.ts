import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricData
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan
} from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const spanExporter = new InMemorySpanExporter();
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60_000
});
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)]
});
const meterProvider = new MeterProvider({ readers: [metricReader] });
const contextManager = new AsyncLocalStorageContextManager();

let core: typeof import("../src/index.js");
let telemetry: typeof import("../src/telemetry.js");

beforeAll(async () => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(tracerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
  [core, telemetry] = await Promise.all([
    import("../src/index.js"),
    import("../src/telemetry.js")
  ]);
});

beforeEach(() => {
  spanExporter.reset();
  metricExporter.reset();
});

afterEach(async () => {
  await meterProvider.forceFlush();
  spanExporter.reset();
  metricExporter.reset();
});

afterAll(async () => {
  await tracerProvider.shutdown();
  await meterProvider.shutdown();
  trace.disable();
  metrics.disable();
  context.disable();
  contextManager.disable();
});

describe("OpenTelemetry instrumentation", () => {
  it("emits one core span for a direct server-side call", async () => {
    const { auth } = createHarness();

    await auth.createUser({ email: "direct@example.com" });
    await meterProvider.forceFlush();

    const spans = ownAuthSpans();
    expect(spans.map(({ name }) => name)).toEqual(["own-auth.operation createUser"]);
    expect(spans[0]?.parentSpanContext).toBeUndefined();
    expect(spans[0]?.attributes).toMatchObject({
      "own_auth.operation.name": "createUser"
    });
    expect(metricPoints("own_auth.operation.count")).toContainEqual(expect.objectContaining({
      attributes: {
        "own_auth.operation.name": "createUser",
        "own_auth.operation.outcome": "success"
      },
      value: 1
    }));
    expect(metricPoints("own_auth.operation.duration")[0]).toMatchObject({
      attributes: {
        "own_auth.operation.name": "createUser",
        "own_auth.operation.outcome": "success"
      },
      value: { count: 1 }
    });
  });

  it("nests the core operation beneath the HTTP handler span", async () => {
    const { auth } = createHarness();
    const handler = core.createOwnAuthHandler(auth);
    const response = await handler(jsonRequest("/api/auth/sign-up/email", {
      email: "http@example.com",
      password: "correct-horse"
    }));

    expect(response.status).toBe(200);
    const httpSpan = findSpan("own-auth.http signUpEmailPassword");
    const coreSpan = findSpan("own-auth.operation signUpEmailPassword");
    expect(coreSpan.parentSpanContext?.spanId).toBe(httpSpan.spanContext().spanId);
    expect(coreSpan.spanContext().traceId).toBe(httpSpan.spanContext().traceId);
    expect(httpSpan.attributes).toMatchObject({
      "http.request.method": "POST",
      "http.response.status_code": 200,
      "http.route": "/api/auth/sign-up/email",
      "own_auth.endpoint.id": "signUpEmailPassword",
      "own_auth.http.outcome": "success"
    });
  });

  it("records a safe error type without exception messages or stack traces", async () => {
    const { auth } = createHarness();
    await auth.signUpEmailPassword({
      email: "error@example.com",
      password: "correct-horse"
    });
    spanExporter.reset();

    await expect(auth.signInEmailPassword({
      email: "error@example.com",
      password: "sentinel-wrong-password"
    })).rejects.toMatchObject({ code: "invalid_credentials" });

    const span = findSpan("own-auth.operation signInEmailPassword");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBeUndefined();
    expect(span.attributes["error.type"]).toBe("invalid_credentials");
    expect(span.events).toEqual([]);
    const exported = JSON.stringify(safeSpan(span));
    expect(exported).not.toContain("sentinel-wrong-password");
    expect(exported).not.toContain("exception.");

    spanExporter.reset();
    const providerError = Object.assign(new Error("sentinel-provider-message"), {
      code: "sentinel_provider_code"
    });
    await expect(telemetry.traceOAuthProvider("google", "exchange", async () => {
      throw providerError;
    })).rejects.toBe(providerError);

    const providerSpan = findSpan("own-auth.oauth.provider");
    expect(providerSpan.attributes["error.type"]).toBe("internal_error");
    expect(providerSpan.events).toEqual([]);
    expect(JSON.stringify(safeSpan(providerSpan))).not.toContain("sentinel-");
  });

  it("emits delivery spans and metrics with fixed safe labels", async () => {
    const { auth } = createHarness();
    await auth.createUser({ email: "delivery@example.com" });
    await drainMetrics();
    spanExporter.reset();

    await auth.requestMagicLink({
      email: "delivery@example.com",
      redirectUrl: "/dashboard"
    });
    await meterProvider.forceFlush();

    const span = findSpan("own-auth.delivery email");
    expect(span.attributes).toMatchObject({
      "own_auth.delivery.channel": "email",
      "own_auth.delivery.type": "magic_link"
    });
    expect(metricPoints("own_auth.delivery.count")).toContainEqual(expect.objectContaining({
      attributes: {
        "own_auth.delivery.channel": "email",
        "own_auth.delivery.outcome": "success",
        "own_auth.delivery.type": "magic_link"
      },
      value: 1
    }));
  });

  it("records webhook outcomes without payloads, URLs, or secrets", async () => {
    const { auth } = createHarness({
      webhooks: {
        endpoints: [{
          id: "public-events",
          url: "https://sentinel-webhook.example/private",
          secret: "sentinel-webhook-secret-at-least-32-bytes",
          events: ["user.signed_up"]
        }],
        fetch: async () => new Response(null, { status: 204 })
      }
    });
    await auth.signUpEmailPassword({
      email: "sentinel-webhook-user@example.com",
      password: "correct-horse"
    });
    await drainMetrics();
    spanExporter.reset();

    await auth.processWebhookDeliveries();
    await meterProvider.forceFlush();

    const span = findSpan("own-auth.webhook.deliver");
    expect(span.attributes).toMatchObject({
      "own_auth.webhook.endpoint.id": "public-events",
      "own_auth.webhook.event.type": "user.signed_up",
      "own_auth.webhook.outcome": "delivered"
    });
    expect(metricPoints("own_auth.webhook.delivery.count")).toContainEqual(
      expect.objectContaining({ value: 1 })
    );
    const exported = JSON.stringify(ownAuthSpans().map(safeSpan));
    expect(exported).not.toContain("sentinel-webhook.example");
    expect(exported).not.toContain("sentinel-webhook-secret");
    expect(exported).not.toContain("sentinel-webhook-user");
  });

  it("extracts a bounded rate-limit bucket without exposing the key", async () => {
    telemetry.recordRateLimitDenial("signin:user@example.com");
    telemetry.recordRateLimitDenial("custom:user@example.com");
    await meterProvider.forceFlush();

    const points = metricPoints("own_auth.rate_limit.denial.count");
    expect(points.map(({ attributes }) => attributes["own_auth.rate_limit.bucket"]).sort())
      .toEqual(["other", "signin"]);
    expect(JSON.stringify(points)).not.toContain("user@example.com");
  });

  it("records plugin and provider work without recording inputs or results", async () => {
    const plugin = core.defineOwnAuthPlugin({
      id: "telemetry-check",
      version: "1.0.0",
      serverMethods: {
        inspect: ({ input }) => ({ received: input })
      }
    });
    const { auth } = createHarness({ plugins: [plugin] });

    await auth.callPluginMethod("telemetry-check", "inspect", {
      secret: "sentinel-plugin-secret"
    });
    await telemetry.traceOAuthProvider("google", "exchange", async () => ({
      accessToken: "sentinel-provider-token"
    }));

    expect(findSpan("own-auth.plugin").attributes).toMatchObject({
      "own_auth.plugin.id": "telemetry-check",
      "own_auth.plugin.kind": "method",
      "own_auth.plugin.operation": "inspect"
    });
    expect(findSpan("own-auth.oauth.provider").attributes).toMatchObject({
      "own_auth.oauth.operation": "exchange",
      "own_auth.oauth.provider": "google"
    });
    expect(JSON.stringify(ownAuthSpans().map(safeSpan))).not.toContain("sentinel-");
  });

  it("never records request secrets, headers, query values, or full URLs", async () => {
    const { auth } = createHarness();
    const handler = core.createOwnAuthHandler(auth);
    const response = await handler(new Request(
      "https://private.example/api/auth/sign-up/email?token=sentinel-query-token",
      {
        method: "POST",
        headers: {
          authorization: "Bearer sentinel-authorization-token",
          cookie: "own_auth_session=sentinel-cookie-token",
          "content-type": "application/json",
          origin: "https://private.example",
          "x-forwarded-for": "203.0.113.42"
        },
        body: JSON.stringify({
          email: "sentinel-person@example.com",
          password: "sentinel-password"
        })
      }
    ));

    expect(response.status).toBe(200);
    const exported = JSON.stringify(ownAuthSpans().map(safeSpan));
    expect(exported).not.toContain("sentinel-");
    expect(exported).not.toContain("private.example");
    expect(exported).not.toContain("203.0.113.42");
    expect(exported).not.toContain("authorization");
    expect(exported).not.toContain("cookie");
  });
});

function createHarness(
  overrides: Partial<Parameters<typeof core.createOwnAuth>[0]> = {}
) {
  const auth = core.createOwnAuth({
    storage: new core.InMemoryAuthStorage(),
    emailProvider: new core.MemoryEmailProvider(),
    smsProvider: new core.MemorySmsProvider(),
    tokenPepper: "telemetry-test-pepper",
    baseUrl: "http://localhost:3000",
    ...overrides
  });
  return { auth };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

function ownAuthSpans(): ReadableSpan[] {
  return spanExporter.getFinishedSpans().filter(
    ({ instrumentationScope }) => instrumentationScope.name === "own-auth"
  );
}

function findSpan(name: string): ReadableSpan {
  const span = ownAuthSpans().find((candidate) => candidate.name === name);
  if (!span) throw new Error(`Missing telemetry span: ${name}`);
  return span;
}

function safeSpan(span: ReadableSpan): unknown {
  return {
    name: span.name,
    attributes: span.attributes,
    events: span.events,
    status: span.status
  };
}

async function drainMetrics(): Promise<void> {
  await meterProvider.forceFlush();
  metricExporter.reset();
}

function metricPoints(name: string): Array<MetricData["dataPoints"][number]> {
  const matchingMetrics = metricExporter.getMetrics()
    .flatMap(({ scopeMetrics }) => scopeMetrics)
    .filter(({ scope }) => scope.name === "own-auth")
    .flatMap(({ metrics: scopeMetrics }) => scopeMetrics)
    .filter(({ descriptor }) => descriptor.name === name);
  const points: Array<MetricData["dataPoints"][number]> = [];
  for (const metric of matchingMetrics) {
    points.push(...metric.dataPoints as Array<MetricData["dataPoints"][number]>);
  }
  return points;
}
