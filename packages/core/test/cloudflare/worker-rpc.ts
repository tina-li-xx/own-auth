import { AuthError } from "../../dist/index.js";
import {
  decodeConformanceValue,
  encodeConformanceValue,
  isRecord,
  type ConformanceRpcRequest
} from "./conformance-protocol.js";

export async function readConformanceRpc(request: Request): Promise<ConformanceRpcRequest> {
  const decoded = decodeConformanceValue(await request.json());
  if (!isRecord(decoded) || typeof decoded.method !== "string" || !Array.isArray(decoded.args)) {
    throw new AuthError("validation_error", "Invalid conformance request", 400);
  }
  return decoded as unknown as ConformanceRpcRequest;
}

export async function invokeConformanceRpc(
  target: object,
  rpc: ConformanceRpcRequest,
  allowedMethods: ReadonlySet<string>
): Promise<Response> {
  const method = (target as Record<string, unknown>)[rpc.method];
  if (!allowedMethods.has(rpc.method) || typeof method !== "function") {
    return Response.json({ error: { message: "Conformance method is not allowed" } }, {
      status: 405
    });
  }
  const value = await method.apply(target, rpc.args);
  return Response.json(encodeConformanceValue(value));
}
