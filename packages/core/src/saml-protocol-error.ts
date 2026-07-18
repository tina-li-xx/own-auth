export type SamlProtocolErrorCode =
  | "saml_response_invalid"
  | "saml_signature_algorithm_unsupported";

export class SamlProtocolError extends Error {
  readonly code: SamlProtocolErrorCode;

  constructor(code: SamlProtocolErrorCode, message: string) {
    super(message);
    this.name = "SamlProtocolError";
    this.code = code;
  }
}
