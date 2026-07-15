import { OwnAuth } from "./auth-engine.js";
import type {
  AuthorizationCustomPermission,
  AuthorizationCustomRole,
  AnyOwnAuthAuthorizationDefinition
} from "./authorization.js";
import type { OwnAuthOptions } from "./auth-engine-options.js";

export function createOwnAuth<
  const Authorization extends AnyOwnAuthAuthorizationDefinition
>(
  options: OwnAuthOptions<Authorization> & { authorization: Authorization }
): OwnAuth<
  AuthorizationCustomRole<Authorization>,
  AuthorizationCustomPermission<Authorization>
>;
export function createOwnAuth(options?: OwnAuthOptions): OwnAuth;
export function createOwnAuth(
  options?: OwnAuthOptions<AnyOwnAuthAuthorizationDefinition>
): OwnAuth<string, string> {
  return new OwnAuth<string, string>(options);
}
