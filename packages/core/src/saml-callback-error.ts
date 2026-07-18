import { AuthError } from "./errors.js";

export class SamlCallbackError extends AuthError {
  readonly destination: string | null;

  constructor(error: AuthError, destination: string | null, cause?: unknown) {
    super(error.code, error.safeMessage, error.statusCode);
    this.name = "SamlCallbackError";
    this.destination = destination;
    if (cause !== undefined) Object.defineProperty(this, "cause", { value: cause });
  }
}
