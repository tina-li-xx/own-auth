import { exportPKCS8, generateKeyPair } from "jose";

export function createAuthorizationFormRequest(origin: string) {
  return (
    path: string,
    values: URLSearchParams | Record<string, string>,
    dpopProof?: string
  ): Request => new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(dpopProof ? { dpop: dpopProof } : {})
    },
    body: values instanceof URLSearchParams ? values : new URLSearchParams(values)
  });
}

export async function createSigningPrivateKey(): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return exportPKCS8(privateKey);
}
