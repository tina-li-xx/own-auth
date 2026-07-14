import {
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser";
import type { OwnAuthClient } from "./client.js";
import type {
  AuthSessionPayload,
  PublicPasskey
} from "./http/contract.js";

export async function registerPasskey(
  client: OwnAuthClient,
  options: { name?: string; useAutoRegister?: boolean } = {}
): Promise<PublicPasskey> {
  const { options: optionsJSON } = await client.beginPasskeyRegistration();
  const response = await startRegistration({
    optionsJSON,
    useAutoRegister: options.useAutoRegister
  });
  const result = await client.completePasskeyRegistration({
    response,
    name: options.name
  });
  return result.passkey;
}

export async function authenticateWithPasskey(
  client: OwnAuthClient,
  options: {
    userId?: string;
    mfa?: boolean;
    useBrowserAutofill?: boolean;
  } = {}
): Promise<AuthSessionPayload> {
  const { options: optionsJSON } = await client.beginPasskeyAuthentication({
    userId: options.userId,
    mfa: options.mfa
  });
  const response = await startAuthentication({
    optionsJSON,
    useBrowserAutofill: options.useBrowserAutofill
  });
  return client.completePasskeyAuthentication({ response });
}
