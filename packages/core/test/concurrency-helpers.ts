import { randomUUID } from "node:crypto";
import { expect } from "vitest";

export function expectOneWinner(
  results: PromiseSettledResult<unknown>[],
  losingErrorCode: string
): number {
  const winner = results.findIndex((result) => result.status === "fulfilled");
  const losers = results.filter((result) => result.status === "rejected");

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(losers).toHaveLength(1);
  expect(losers[0]).toMatchObject({ reason: { code: losingErrorCode } });
  expect(winner).toBeGreaterThanOrEqual(0);
  return winner;
}

export function uniquePhone(): string {
  const digits = randomUUID().replace(/\D/g, "").slice(0, 10).padEnd(10, "0");
  return `+1${digits}`;
}
