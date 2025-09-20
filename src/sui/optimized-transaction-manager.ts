import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { createSuiClient } from "./client";

// Move 스마트 컨트랙트 패키지 정보
const COUPON_PACKAGE_ID = process.env.COUPON_PACKAGE_ID || "";
const PLATFORM_CONFIG_ID = process.env.PLATFORM_CONFIG_ID || "";

export interface OptimizedTransactionResult {
  digest: string;
  success: boolean;
  gasUsed: string;
  error?: string;
}

export interface CouponIssueData {
  provider: string;
  couponType: string;
  value: bigint;
  expiryDays: bigint;
  encryptedData: string;
}

export interface CouponSaleData {
  price: bigint;
}

export interface CouponBundleData {
  coupons: string[];
  totalPrice: bigint;
  discountRate: number;
}

/**
 * PTB (Programmable Transaction Blocks)를 활용한 최적화된 트랜잭션 관리자
 * 기존 API 구조는 유지하면서 내부적으로만 PTB를 활용하여 성능 향상
 */
export class OptimizedTransactionManager {
  private client: SuiClient;

  constructor() {
    this.client = createSuiClient();
  }

  /**
   * 쿠폰 발행 + 판매 등록을 단일 PTB로 처리
   * 기존 API와 호환성을 유지하면서 내부적으로 최적화
   */
  async issueAndListCoupon(
    providerKeypair: Ed25519Keypair,
    issueData: CouponIssueData,
    saleData: CouponSaleData
  ): Promise<{ issueResult: string; listResult: string; gasUsed: string }> {
    try {
      const tx = new TransactionBlock();

      // 1. 쿠폰 발행
      const [coupon] = tx.moveCall({
        target: `${COUPON_PACKAGE_ID}::coupon::issue_coupon`,
        arguments: [
          tx.object(PLATFORM_CONFIG_ID),
          tx.pure(issueData.provider),
          tx.pure(issueData.couponType),
          tx.pure(issueData.value.toString()),
          tx.pure(issueData.expiryDays.toString()),
          tx.pure(issueData.encryptedData),
          tx.object("0x6"), // Clock object
        ],
      });

      // 2. 즉시 판매 등록 (같은 트랜잭션 내에서)
      const [sale] = tx.moveCall({
        target: `${COUPON_PACKAGE_ID}::coupon::list_coupon_for_sale`,
        arguments: [coupon, tx.pure(saleData.price.toString())],
      });

      // 3. 판매 객체를 발행자에게 전송
      tx.transferObjects(
        [sale],
        tx.pure(providerKeypair.getPublicKey().toSuiAddress())
      );

      // 4. 가스 예산 설정 (최적화)
      tx.setGasBudget(100000000);

      const result = await this.client.signAndExecuteTransactionBlock({
        signer: providerKeypair,
        transactionBlock: await tx.build({ client: this.client }),
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

      if (!success) {
        throw new Error(result.effects?.status?.error || "Transaction failed");
      }

      // API 호환성을 위해 기존 형식으로 반환
      return {
        issueResult: result.digest,
        listResult: result.digest, // 같은 트랜잭션
        gasUsed,
      };
    } catch (error: any) {
      throw new Error(`PTB issue and list failed: ${error.message}`);
    }
  }

  /**
   * 쿠폰 번들 구매 (여러 쿠폰을 단일 PTB로 처리)
   * 할인 혜택과 함께 효율적으로 처리
   */
  async buyCouponBundle(
    buyerKeypair: Ed25519Keypair,
    bundleData: CouponBundleData,
    paymentAmount: bigint
  ): Promise<OptimizedTransactionResult> {
    try {
      const tx = new TransactionBlock();

      // 1. 할인 계산
      const discountAmount =
        (bundleData.totalPrice * BigInt(bundleData.discountRate)) / 100n;
      const finalPrice = bundleData.totalPrice - discountAmount;

      // 2. 지불 검증
      if (paymentAmount < finalPrice) {
        throw new Error("Insufficient payment for bundle");
      }

      // 3. 각 쿠폰 구매 (병렬 처리)
      const couponObjects = [];
      for (const couponId of bundleData.coupons) {
        const [coupon] = tx.moveCall({
          target: `${COUPON_PACKAGE_ID}::coupon::buy_coupon`,
          arguments: [
            tx.object(couponId), // sale object
            tx.object(couponId), // coupon object
            tx.object(PLATFORM_CONFIG_ID),
            tx.gas, // payment coin
          ],
        });
        couponObjects.push(coupon);
      }

      // 4. 할인 혜택 적용 (잔액 반환)
      if (paymentAmount > finalPrice) {
        const refund = tx.splitCoins(tx.gas, [
          tx.pure((paymentAmount - finalPrice).toString()),
        ]);
        tx.transferObjects(
          [refund],
          tx.pure(buyerKeypair.getPublicKey().toSuiAddress())
        );
      }

      // 5. 구매된 쿠폰들을 구매자에게 전송
      tx.transferObjects(
        couponObjects,
        tx.pure(buyerKeypair.getPublicKey().toSuiAddress())
      );

      // 6. 가스 예산 설정
      tx.setGasBudget(200000000); // 번들 처리용으로 더 큰 예산

      const result = await this.client.signAndExecuteTransactionBlock({
        signer: buyerKeypair,
        transactionBlock: await tx.build({ client: this.client }),
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
        gasUsed: "0",
        error: error.message,
      };
    }
  }

  /**
   * 배치 쿠폰 발행 (여러 쿠폰을 단일 PTB로 처리)
   * 공급자가 여러 쿠폰을 한 번에 발행할 때 사용
   */
  async batchIssueCoupons(
    providerKeypair: Ed25519Keypair,
    couponsData: CouponIssueData[]
  ): Promise<{ digests: string[]; gasUsed: string }> {
    try {
      const tx = new TransactionBlock();
      const issuedCoupons = [];

      // 1. 각 쿠폰 발행
      for (const couponData of couponsData) {
        const [coupon] = tx.moveCall({
          target: `${COUPON_PACKAGE_ID}::coupon::issue_coupon`,
          arguments: [
            tx.object(PLATFORM_CONFIG_ID),
            tx.pure(couponData.provider),
            tx.pure(couponData.couponType),
            tx.pure(couponData.value.toString()),
            tx.pure(couponData.expiryDays.toString()),
            tx.pure(couponData.encryptedData),
            tx.object("0x6"), // Clock object
          ],
        });
        issuedCoupons.push(coupon);
      }

      // 2. 모든 쿠폰을 발행자에게 전송
      tx.transferObjects(
        issuedCoupons,
        tx.pure(providerKeypair.getPublicKey().toSuiAddress())
      );

      // 3. 가스 예산 설정 (배치 처리용)
      tx.setGasBudget(150000000);

      const result = await this.client.signAndExecuteTransactionBlock({
        signer: providerKeypair,
        transactionBlock: await tx.build({ client: this.client }),
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

      if (!success) {
        throw new Error(result.effects?.status?.error || "Batch issue failed");
      }

      // API 호환성을 위해 각 쿠폰별로 동일한 digest 반환
      const digests = couponsData.map(() => result.digest);

      return {
        digests,
        gasUsed,
      };
    } catch (error: any) {
      throw new Error(`Batch issue failed: ${error.message}`);
    }
  }

  /**
   * 조건부 쿠폰 처리 (PTB의 조건부 로직 활용)
   * 특정 조건에 따라 다른 작업을 수행
   */
  async conditionalCouponProcessing(
    userKeypair: Ed25519Keypair,
    conditions: {
      hasCoupon: boolean;
      couponId?: string;
      action: "use" | "transfer" | "list";
      targetAddress?: string;
      price?: bigint;
    }
  ): Promise<OptimizedTransactionResult> {
    try {
      const tx = new TransactionBlock();

      if (conditions.hasCoupon && conditions.couponId) {
        if (conditions.action === "use") {
          // 쿠폰 사용
          tx.moveCall({
            target: `${COUPON_PACKAGE_ID}::coupon::use_coupon`,
            arguments: [
              tx.object(conditions.couponId),
              tx.object("0x6"), // Clock object
            ],
          });
        } else if (
          conditions.action === "transfer" &&
          conditions.targetAddress
        ) {
          // 쿠폰 전송
          tx.moveCall({
            target: `${COUPON_PACKAGE_ID}::coupon::transfer_coupon`,
            arguments: [
              tx.object(conditions.couponId),
              tx.pure(conditions.targetAddress),
            ],
          });
        } else if (conditions.action === "list" && conditions.price) {
          // 쿠폰 판매 등록
          const [sale] = tx.moveCall({
            target: `${COUPON_PACKAGE_ID}::coupon::list_coupon_for_sale`,
            arguments: [
              tx.object(conditions.couponId),
              tx.pure(conditions.price.toString()),
            ],
          });
          tx.transferObjects(
            [sale],
            tx.pure(userKeypair.getPublicKey().toSuiAddress())
          );
        }
      }

      const result = await this.client.signAndExecuteTransactionBlock({
        signer: userKeypair,
        transactionBlock: await tx.build({ client: this.client }),
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
        gasUsed: "0",
        error: error.message,
      };
    }
  }

  /**
   * 가스 최적화된 트랜잭션 실행
   * 가스 예산을 동적으로 조정하여 최적화
   */
  async executeWithGasOptimization(
    keypair: Ed25519Keypair,
    transactionBlock: TransactionBlock,
    estimatedGas?: bigint
  ): Promise<OptimizedTransactionResult> {
    try {
      // 1. 가스 예상 (dry run)
      const dryRunResult = await this.client.dryRunTransactionBlock({
        transactionBlock: await transactionBlock.build({ client: this.client }),
      });

      const estimatedGasCost = dryRunResult.effects?.gasUsed
        ? BigInt(
            dryRunResult.effects.gasUsed.computationCost +
              dryRunResult.effects.gasUsed.storageCost +
              dryRunResult.effects.gasUsed.storageRebate
          )
        : BigInt(10000000); // 기본값

      // 2. 가스 예산 설정 (예상 가스의 150%로 설정)
      const gasBudget = (estimatedGasCost * 150n) / 100n;
      transactionBlock.setGasBudget(gasBudget);

      // 3. 트랜잭션 실행
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
        gasUsed: "0",
        error: error.message,
      };
    }
  }
}

export const optimizedTransactionManager = new OptimizedTransactionManager();
