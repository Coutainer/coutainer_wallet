import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";

export function createSuiClient(): SuiClient {
  const network = (process.env.SUI_NETWORK || "devnet") as
    | "devnet"
    | "testnet"
    | "mainnet"
    | string;
  const url = ["devnet", "testnet", "mainnet"].includes(network)
    ? getFullnodeUrl(network as "devnet" | "testnet" | "mainnet")
    : network; // allow custom RPC URL
  return new SuiClient({ url });
}

