import type { D1DatabaseLike } from "../../dist/d1/index.js";
import {
  conformanceErrorResponse,
  handleAuthRpc,
  handleCloseLifecycle,
  handleInspection,
  handleRateLimitRpc,
  handleSchemaInspection,
  handleStorageRpc
} from "./worker-conformance.js";

interface Env {
  DB: D1DatabaseLike;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return new Response("Not found", { status: 404 });

    try {
      switch (path) {
        case "/conformance/auth":
          return await handleAuthRpc(request, env.DB);
        case "/conformance/storage":
          return await handleStorageRpc(request, env.DB);
        case "/conformance/rate-limit":
          return await handleRateLimitRpc(request, env.DB);
        case "/conformance/inspect":
          return await handleInspection(request, env.DB);
        case "/conformance/schema":
          return await handleSchemaInspection(env.DB);
        case "/conformance/close":
          return await handleCloseLifecycle(env.DB);
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      return conformanceErrorResponse(error);
    }
  }
};
