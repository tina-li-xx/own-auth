export type ScimErrorType =
  | "invalidFilter"
  | "invalidPath"
  | "invalidSyntax"
  | "invalidValue"
  | "mutability"
  | "noTarget"
  | "tooMany"
  | "uniqueness";

export class ScimProtocolError extends Error {
  constructor(
    readonly status: number,
    readonly scimType: ScimErrorType | null,
    message: string
  ) {
    super(message);
    this.name = "ScimProtocolError";
  }
}
