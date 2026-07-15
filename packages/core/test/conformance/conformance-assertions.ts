export function assertConformance(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertConformanceEqual<Value>(
  actual: Value,
  expected: Value,
  message: string
): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

export function assertConformanceArrayEqual(
  actual: readonly unknown[],
  expected: readonly unknown[],
  message: string
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

export function assertSingleValueWinner<Value>(
  results: readonly (Value | null)[],
  message: string
): Value {
  const winners = results.filter((result): result is Value => result !== null);
  assertConformanceEqual(winners.length, 1, `${message}: winner count`);
  assertConformanceEqual(
    results.filter((result) => result === null).length,
    1,
    `${message}: loser count`
  );
  return winners[0]!;
}

export function assertSingleSettledWinner(
  results: readonly PromiseSettledResult<unknown>[],
  losingErrorCode: string,
  message = "concurrent operation"
): number {
  const winner = results.findIndex((result) => result.status === "fulfilled");
  const losers = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  assertConformanceEqual(
    results.filter((result) => result.status === "fulfilled").length,
    1,
    `${message}: winner count`
  );
  assertConformanceEqual(losers.length, 1, `${message}: loser count`);
  assertConformanceEqual(
    errorCode(losers[0]!.reason),
    losingErrorCode,
    `${message}: losing error code`
  );
  assertConformance(winner >= 0, `${message}: no fulfilled result`);
  return winner;
}

export function requireConformanceValue<Value>(
  value: Value | null | undefined,
  message: string
): Value {
  assertConformance(value !== null && value !== undefined, message);
  return value;
}

export function requireCompleteResult<Result extends { status: string }>(
  result: Result,
  operation: string
): Extract<Result, { status: "complete" }> {
  assertConformanceEqual(result.status, "complete", `${operation} status`);
  return result as Extract<Result, { status: "complete" }>;
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}
