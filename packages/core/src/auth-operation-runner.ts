export type AuthOperationRunner = <Result>(
  operation: string,
  input: unknown,
  work: () => Promise<Result>
) => Promise<Result>;
