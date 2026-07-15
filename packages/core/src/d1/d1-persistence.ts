import { D1RateLimitStore } from "./d1-rate-limit-store.js";
import { D1AuthStorage } from "./d1-storage.js";
import type { D1DatabaseLike } from "./d1-types.js";

export interface D1Persistence {
  storage: D1AuthStorage;
  rateLimitStore: D1RateLimitStore;
}

export function createD1Persistence(database: D1DatabaseLike): D1Persistence {
  return {
    storage: new D1AuthStorage(database),
    rateLimitStore: new D1RateLimitStore(database)
  };
}
