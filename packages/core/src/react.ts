import { useEffect, useSyncExternalStore } from "react";
import {
  createOwnAuthClient,
  type OwnAuthClient,
  type OwnAuthClientOptions,
  type OwnAuthSessionSnapshot
} from "./client.js";

export type OwnAuthReactClient = OwnAuthClient & {
  useSession: () => OwnAuthSessionSnapshot;
};

export function useOwnAuthSession(client: OwnAuthClient): OwnAuthSessionSnapshot {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSessionSnapshot,
    client.getSessionSnapshot
  );

  useEffect(() => {
    void client.ensureSession().catch(() => undefined);
  }, [client]);

  return snapshot;
}

export function createOwnAuthReactClient(
  options?: OwnAuthClientOptions
): OwnAuthReactClient {
  const client = createOwnAuthClient(options);

  return Object.assign(client, {
    useSession: (): OwnAuthSessionSnapshot => useOwnAuthSession(client)
  });
}
