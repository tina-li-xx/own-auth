import {
  calculateDpopKeyThumbprint,
  createDpopProofJwt,
  generateDpopKeyPair as generateKeyPair,
  type DpopCryptoKeyPair
} from "./dpop-crypto.js";

export interface DpopKeyPair extends DpopCryptoKeyPair {
  jwkThumbprint: string;
}

export interface CreateDpopProofInput {
  keyPair: DpopCryptoKeyPair;
  method: string;
  url: string;
  accessToken?: string;
}

export async function generateDpopKeyPair(): Promise<DpopKeyPair> {
  const keyPair = await generateKeyPair();
  return {
    ...keyPair,
    jwkThumbprint: await calculateDpopKeyThumbprint(keyPair.publicKey)
  };
}

export function createDpopProof(input: CreateDpopProofInput): Promise<string> {
  return createDpopProofJwt(input);
}
