import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { createSuiClient } from "./client";
import { getAddressFromKeypair } from "./utils";
import {
  generateWallet,
  getSuiBalance,
  transferSui,
  importKeypairFromMnemonic,
  importKeypairFromPrivateKeyBase64,
} from "./wallet";

export interface WalletInfo {
  address: string;
  balance: bigint;
  mnemonic?: string;
  keypair?: Ed25519Keypair;
}

export interface TransactionResult {
  digest: string;
  success: boolean;
  error?: string;
  gasUsed?: string;
}

export class SuiWalletManager {
  private client: SuiClient;

  constructor() {
    this.client = createSuiClient();
  }

  /**
   * 새 지갑 생성
   */
  async createWallet(): Promise<WalletInfo> {
    const wallet = generateWallet();
    const keypair = importKeypairFromMnemonic(wallet.mnemonic);
    const balance = await getSuiBalance(this.client, wallet.address);

    return {
      address: wallet.address,
      balance,
      mnemonic: wallet.mnemonic,
      keypair,
    };
  }

  /**
   * 니모닉으로 지갑 복원
   */
  async restoreWalletFromMnemonic(mnemonic: string): Promise<WalletInfo> {
    const keypair = importKeypairFromMnemonic(mnemonic);
    const address = getAddressFromKeypair(keypair);
    const balance = await getSuiBalance(this.client, address);

    return {
      address,
      balance,
      mnemonic,
      keypair,
    };
  }

  /**
   * 프라이빗 키로 지갑 복원
   */
  async restoreWalletFromPrivateKey(
    privateKeyB64: string
  ): Promise<WalletInfo> {
    const keypair = importKeypairFromPrivateKeyBase64(privateKeyB64);
    const address = getAddressFromKeypair(keypair);
    const balance = await getSuiBalance(this.client, address);

    return {
      address,
      balance,
      keypair,
    };
  }

  /**
   * 지갑 정보 조회 (키페어 없이)
   */
  async getWalletInfo(
    address: string
  ): Promise<Omit<WalletInfo, "mnemonic" | "keypair">> {
    const balance = await getSuiBalance(this.client, address);

    return {
      address,
      balance,
    };
  }

  /**
   * SUI 잔액 조회
   */
  async getBalance(address: string): Promise<bigint> {
    return await getSuiBalance(this.client, address);
  }

  /**
   * SUI 전송
   */
  async transferSui(
    senderKeypair: Ed25519Keypair,
    recipient: string,
    amount: bigint
  ): Promise<TransactionResult> {
    try {
      const digest = await transferSui(
        this.client,
        senderKeypair,
        recipient,
        amount
      );

      return {
        digest,
        success: true,
      };
    } catch (error: any) {
      return {
        digest: "",
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 가스비 추정
   */
  async estimateGasFee(
    senderAddress: string,
    transactionBlock: TransactionBlock
  ): Promise<bigint> {
    try {
      const result = await this.client.dryRunTransactionBlock({
        transactionBlock: await transactionBlock.build({ client: this.client }),
      });

      if (result.effects?.gasUsed) {
        return BigInt(
          result.effects.gasUsed.computationCost +
            result.effects.gasUsed.storageCost +
            result.effects.gasUsed.storageRebate
        );
      }

      return BigInt(0);
    } catch (error) {
      console.error("Failed to estimate gas fee:", error);
      return BigInt(0);
    }
  }

  /**
   * 트랜잭션 실행
   */
  async executeTransaction(
    keypair: Ed25519Keypair,
    transactionBlock: TransactionBlock
  ): Promise<TransactionResult> {
    try {
      const result = await this.client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: await transactionBlock.build({ client: this.client }),
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      const success = result.effects?.status?.status === "success";
      const gasUsed = result.effects?.gasUsed
        ? (
            result.effects.gasUsed.computationCost +
            result.effects.gasUsed.storageCost +
            result.effects.gasUsed.storageRebate
          ).toString()
        : "0";

      return {
        digest: result.digest,
        success,
        gasUsed,
        error: success ? undefined : result.effects?.status?.error,
      };
    } catch (error: any) {
      return {
        digest: "",
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 배치 트랜잭션 실행
   */
  async executeBatchTransactions(
    keypair: Ed25519Keypair,
    transactionBlocks: TransactionBlock[]
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];

    for (const tx of transactionBlocks) {
      const result = await this.executeTransaction(keypair, tx);
      results.push(result);

      // 하나라도 실패하면 중단
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * 트랜잭션 상태 조회
   */
  async getTransactionStatus(digest: string): Promise<{
    status: string;
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await this.client.getTransactionBlock({
        digest,
        options: { showEffects: true },
      });

      const status = result.effects?.status?.status || "unknown";
      const success = status === "success";

      return {
        status,
        success,
        error: success ? undefined : result.effects?.status?.error,
      };
    } catch (error: any) {
      return {
        status: "error",
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 사용자의 모든 오브젝트 조회
   */
  async getUserObjects(
    userAddress: string,
    options: {
      objectType?: string;
      limit?: number;
    } = {}
  ): Promise<any[]> {
    try {
      const filter: any = {};

      if (options.objectType) {
        filter.StructType = options.objectType;
      }

      const result = await this.client.getOwnedObjects({
        owner: userAddress,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        options: {
          showContent: true,
          showDisplay: true,
          showType: true,
        },
        limit: options.limit || 50,
      });

      return result.data;
    } catch (error) {
      console.error("Failed to get user objects:", error);
      return [];
    }
  }

  /**
   * 오브젝트 이동 (전송)
   */
  async transferObject(
    senderKeypair: Ed25519Keypair,
    objectId: string,
    recipient: string
  ): Promise<TransactionResult> {
    try {
      const tx = new TransactionBlock();
      tx.transferObjects([tx.object(objectId)], tx.pure(recipient));

      return await this.executeTransaction(senderKeypair, tx);
    } catch (error: any) {
      return {
        digest: "",
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 오브젝트 공유
   */
  async shareObject(
    ownerKeypair: Ed25519Keypair,
    objectId: string
  ): Promise<TransactionResult> {
    try {
      const tx = new TransactionBlock();
      tx.transferObjects(
        [tx.object(objectId)],
        tx.pure(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        )
      );

      return await this.executeTransaction(ownerKeypair, tx);
    } catch (error: any) {
      return {
        digest: "",
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 네트워크 상태 조회
   */
  async getNetworkInfo(): Promise<{
    chainId: string;
    version: string;
    epoch: number;
  }> {
    try {
      // 기본 연결 테스트
      const info = await this.client.getChainIdentifier();

      // RPC API 버전 확인
      let version = "unknown";
      try {
        const apiVersion = await this.client.getRpcApiVersion();
        version = apiVersion?.toString() || "unknown";
      } catch (versionError) {
        console.warn("getRpcApiVersion not supported:", versionError);
      }

      // Epoch 정보 (선택적)
      let epoch = 0;
      try {
        const epochInfo = await this.client.getCurrentEpoch();
        epoch = Number(epochInfo.epoch);
      } catch (epochError) {
        console.warn("getCurrentEpoch not supported, using default epoch");
      }

      return {
        chainId: info || "devnet",
        version: version,
        epoch: epoch,
      };
    } catch (error) {
      console.error("Failed to get network info:", error);
      return {
        chainId: "devnet", // 기본값으로 devnet 설정
        version: "unknown",
        epoch: 0,
      };
    }
  }

  /**
   * 지갑 주소 유효성 검증
   */
  isValidAddress(address: string): boolean {
    try {
      // Sui 주소는 32바이트를 base58로 인코딩한 것
      // 정규식으로 간단히 검증
      const suiAddressRegex = /^0x[a-fA-F0-9]{64}$/;
      return suiAddressRegex.test(address);
    } catch {
      return false;
    }
  }

  /**
   * 키페어에서 주소 추출
   */
  getAddressFromKeypair(keypair: Ed25519Keypair): string {
    return getAddressFromKeypair(keypair);
  }
}

export const suiWalletManager = new SuiWalletManager();
