import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { generateMnemonic } from "bip39";
import { getAddressFromKeypair } from "./utils";

export type GeneratedWallet = {
  mnemonic: string;
  address: string;
};

export function generateWallet(): GeneratedWallet {
  const mnemonic = generateMnemonic();
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
  const address = getAddressFromKeypair(keypair);
  return { mnemonic, address };
}

export async function getSuiBalance(
  client: SuiClient,
  address: string
): Promise<bigint> {
  const { totalBalance } = await client.getBalance({ owner: address });
  return BigInt(totalBalance);
}

export async function transferSui(
  client: SuiClient,
  sender: Ed25519Keypair,
  recipient: string,
  amount: bigint
): Promise<string> {
  const tx = new TransactionBlock();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure(amount.toString())]);
  tx.transferObjects([coin], tx.pure(recipient));
  const result = await client.signAndExecuteTransactionBlock({
    signer: sender,
    transactionBlock: tx,
    options: { showEffects: true },
  });
  return result.digest;
}

export function importKeypairFromMnemonic(mnemonic: string): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(mnemonic);
}

export function importKeypairFromPrivateKeyBase64(
  privateKeyB64: string
): Ed25519Keypair {
  const secretKey = fromB64(privateKeyB64);
  return Ed25519Keypair.fromSecretKey(secretKey);
}
