import type { OwnAuthHttpErrorCode } from "./contract.js";

export class OwnAuthHttpError extends Error {
  readonly code: OwnAuthHttpErrorCode;
  readonly statusCode: number;

  constructor(code: OwnAuthHttpErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "OwnAuthHttpError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
