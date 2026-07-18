import type { AuthEngineContext } from "./auth-engine-context.js";
import * as authentication from "./saml-authentication.js";
import * as connections from "./saml-connections.js";
import { completeSamlResponse } from "./saml-internals.js";
import type { AuthOperationRunner } from "./auth-operation-runner.js";
import type {
  CreateSamlConnectionInput,
  CreateSamlLinkUrlInput,
  CreateSamlSignInUrlInput,
  ListSamlConnectionsInput,
  PublicSamlConnection,
  SamlAuthorizationUrl,
  SamlCompletionInput,
  SamlCompletionResult,
  SamlConnectionAccessInput,
  SamlMetadataInput,
  UnlinkSamlIdentityInput,
  UpdateSamlConnectionInput
} from "./saml-types.js";

export class OwnAuthSaml {
  constructor(
    private readonly ctx: AuthEngineContext,
    private readonly execute: AuthOperationRunner
  ) {}

  /** @internal Used by createOwnAuthHandler. */
  isConfigured(): boolean {
    return Boolean(this.ctx.saml && this.ctx.samlStorage);
  }

  createConnection(input: CreateSamlConnectionInput): Promise<PublicSamlConnection> {
    return this.execute("saml.createConnection", input, () =>
      connections.createConnection(this.ctx, input));
  }

  getConnection(input: SamlConnectionAccessInput): Promise<PublicSamlConnection> {
    return this.execute("saml.getConnection", input, () =>
      connections.getConnection(this.ctx, input));
  }

  listConnections(input: ListSamlConnectionsInput): Promise<PublicSamlConnection[]> {
    return this.execute("saml.listConnections", input, () =>
      connections.listConnections(this.ctx, input));
  }

  updateConnection(input: UpdateSamlConnectionInput): Promise<PublicSamlConnection> {
    return this.execute("saml.updateConnection", input, () =>
      connections.updateConnection(this.ctx, input));
  }

  disableConnection(input: SamlConnectionAccessInput): Promise<PublicSamlConnection> {
    return this.execute("saml.disableConnection", input, () =>
      connections.setConnectionEnabled(this.ctx, input, false));
  }

  enableConnection(input: SamlConnectionAccessInput): Promise<PublicSamlConnection> {
    return this.execute("saml.enableConnection", input, () =>
      connections.setConnectionEnabled(this.ctx, input, true));
  }

  createSignInUrl(input: CreateSamlSignInUrlInput): Promise<SamlAuthorizationUrl> {
    return this.execute("saml.createSignInUrl", input, () =>
      authentication.createSignInUrl(this.ctx, input));
  }

  createLinkUrl(input: CreateSamlLinkUrlInput): Promise<SamlAuthorizationUrl> {
    return this.execute("saml.createLinkUrl", input, () =>
      authentication.createLinkUrl(this.ctx, input));
  }

  unlinkIdentity(input: UnlinkSamlIdentityInput): Promise<void> {
    return this.execute("saml.unlinkIdentity", input, () =>
      authentication.unlinkIdentity(this.ctx, input));
  }

  getMetadata(input: SamlMetadataInput): Promise<string> {
    return this.execute("saml.getMetadata", input, () =>
      connections.getMetadata(this.ctx, input));
  }

  /** @internal Used by createOwnAuthHandler. */
  [completeSamlResponse](input: SamlCompletionInput): Promise<SamlCompletionResult> {
    return this.execute("saml.completeResponse", input, () =>
      authentication.completeResponse(this.ctx, input));
  }
}
