import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";

export function getAddressFromKeypair(keypair: Ed25519Keypair): string {
  return keypair.getPublicKey().toSuiAddress();
}

