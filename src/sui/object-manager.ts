import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { createSuiClient } from "./client";
import { getAddressFromKeypair } from "./utils";

// Move 스마트 컨트랙트 패키지 정보
const COUPON_PACKAGE_ID = process.env.COUPON_PACKAGE_ID || "";
const PLATFORM_CONFIG_ID = process.env.PLATFORM_CONFIG_ID || "";

export interface SuiCouponObject {
  id: string;
  issuer: string;
  provider: string;
  couponId: string;
  couponType: string;
  value: bigint;
  expiryTime: bigint;
  used: boolean;
  encryptedData: string;
}

export interface SuiCouponSale {
  id: string;
  couponId: string;
  seller: string;
  price: bigint;
  active: boolean;
}

export class SuiObjectManager {
  private client: SuiClient;

  constructor() {
    this.client = createSuiClient();
  }

  /**
   * 쿠폰 오브젝트 발행 (공급자만 가능)
   */
  async issueCoupon(
    providerKeypair: Ed25519Keypair,
    couponType: string,
    value: bigint,
    expiryDays: number,
    encryptedData: string
  ): Promise<string> {
    const tx = new TransactionBlock();

    // Clock 오브젝트 참조 추가
    tx.moveCall({
      target: `${COUPON_PACKAGE_ID}::coupon::issue_coupon`,
      arguments: [
        tx.object(PLATFORM_CONFIG_ID), // PlatformConfig
        tx.pure(providerKeypair.getPublicKey().toSuiAddress()), // provider address
        tx.pure(couponType),
        tx.pure(value.toString()),
        tx.pure(expiryDays.toString()),
        tx.pure(encryptedData),
        tx.object("0x6"), // Clock object
      ],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer: providerKeypair,
      transactionBlock: await tx.build({ client: this.client }),
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error("Failed to issue coupon");
    }

    return result.digest;
  }

  /**
   * 쿠폰 판매 등록
   */
  async listCouponForSale(
    ownerKeypair: Ed25519Keypair,
    couponObjectId: string,
    price: bigint
  ): Promise<string> {
    const tx = new TransactionBlock();

    tx.moveCall({
      target: `${COUPON_PACKAGE_ID}::coupon::list_coupon_for_sale`,
      arguments: [tx.object(couponObjectId), tx.pure(price.toString())],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer: ownerKeypair,
      transactionBlock: await tx.build({ client: this.client }),
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error("Failed to list coupon for sale");
    }

    return result.digest;
  }

  /**
   * 쿠폰 구매
   */
  async buyCoupon(
    buyerKeypair: Ed25519Keypair,
    saleObjectId: string,
    couponObjectId: string,
    paymentAmount: bigint
  ): Promise<string> {
    const tx = new TransactionBlock();

    // SUI 코인 분할하여 결제
    const [coin] = tx.splitCoins(tx.gas, [tx.pure(paymentAmount.toString())]);

    tx.moveCall({
      target: `${COUPON_PACKAGE_ID}::coupon::buy_coupon`,
      arguments: [
        tx.object(saleObjectId), // CouponSale
        tx.object(couponObjectId), // CouponObject
        tx.object(PLATFORM_CONFIG_ID), // PlatformConfig
        coin, // payment
      ],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer: buyerKeypair,
      transactionBlock: await tx.build({ client: this.client }),
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error("Failed to buy coupon");
    }

    return result.digest;
  }

  /**
   * 쿠폰 사용 (공급자만 가능)
   */
  async useCoupon(
    providerKeypair: Ed25519Keypair,
    couponObjectId: string
  ): Promise<string> {
    const tx = new TransactionBlock();

    tx.moveCall({
      target: `${COUPON_PACKAGE_ID}::coupon::use_coupon`,
      arguments: [
        tx.object(couponObjectId),
        tx.object("0x6"), // Clock object
      ],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer: providerKeypair,
      transactionBlock: await tx.build({ client: this.client }),
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error("Failed to use coupon");
    }

    return result.digest;
  }

  /**
   * 쿠폰 전송 (개인간 거래)
   */
  async transferCoupon(
    senderKeypair: Ed25519Keypair,
    couponObjectId: string,
    recipientAddress: string
  ): Promise<string> {
    const tx = new TransactionBlock();

    tx.moveCall({
      target: `${COUPON_PACKAGE_ID}::coupon::transfer_coupon`,
      arguments: [tx.object(couponObjectId), tx.pure(recipientAddress)],
    });

    const result = await this.client.signAndExecuteTransactionBlock({
      signer: senderKeypair,
      transactionBlock: await tx.build({ client: this.client }),
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error("Failed to transfer coupon");
    }

    return result.digest;
  }

  /**
   * 오브젝트 정보 조회
   */
  async getObjectInfo(objectId: string): Promise<any> {
    try {
      const object = await this.client.getObject({
        id: objectId,
        options: { showContent: true, showDisplay: true },
      });

      return object;
    } catch (error) {
      console.error("Failed to get object info:", error);
      return null;
    }
  }

  /**
   * 사용자의 쿠폰 오브젝트 목록 조회
   */
  async getUserCouponObjects(userAddress: string): Promise<SuiCouponObject[]> {
    try {
      const objects = await this.client.getOwnedObjects({
        owner: userAddress,
        filter: {
          Package: COUPON_PACKAGE_ID,
        },
        options: { showContent: true },
      });

      const couponObjects: SuiCouponObject[] = [];

      for (const obj of objects.data) {
        if (obj.data?.content && "fields" in obj.data.content) {
          const fields = obj.data.content.fields as any;

          // CouponObject 타입인지 확인
          if (fields.coupon_id) {
            couponObjects.push({
              id: obj.data.objectId,
              issuer: fields.issuer,
              provider: fields.provider,
              couponId: fields.coupon_id,
              couponType: fields.coupon_type,
              value: BigInt(fields.value),
              expiryTime: BigInt(fields.expiry_time),
              used: fields.used,
              encryptedData: fields.encrypted_data,
            });
          }
        }
      }

      return couponObjects;
    } catch (error) {
      console.error("Failed to get user coupon objects:", error);
      return [];
    }
  }

  /**
   * 판매 중인 쿠폰 목록 조회
   */
  async getCouponsForSale(): Promise<SuiCouponSale[]> {
    try {
      // 모든 CouponSale 오브젝트 조회 (실제로는 이벤트나 인덱싱을 사용하는 것이 좋음)
      // 여기서는 간단한 예시로 구현
      const objects = await this.client.getOwnedObjects({
        owner:
          "0x0000000000000000000000000000000000000000000000000000000000000000", // 모든 주소
        filter: {
          Package: COUPON_PACKAGE_ID,
        },
        options: { showContent: true },
      });

      const sales: SuiCouponSale[] = [];

      for (const obj of objects.data) {
        if (obj.data?.content && "fields" in obj.data.content) {
          const fields = obj.data.content.fields as any;

          // CouponSale 타입인지 확인
          if (fields.price && fields.active !== undefined) {
            sales.push({
              id: obj.data.objectId,
              couponId: fields.coupon_id,
              seller: fields.seller,
              price: BigInt(fields.price),
              active: fields.active,
            });
          }
        }
      }

      return sales.filter((sale) => sale.active);
    } catch (error) {
      console.error("Failed to get coupons for sale:", error);
      return [];
    }
  }

  /**
   * 오브젝트 소유권 확인
   */
  async isObjectOwnedBy(
    objectId: string,
    userAddress: string
  ): Promise<boolean> {
    try {
      const object = await this.client.getObject({
        id: objectId,
        options: { showOwner: true },
      });

      if (!object.data?.owner) {
        return false;
      }

      // Check if owner is an address string or has AddressOwner property
      if (typeof object.data.owner === "string") {
        return object.data.owner === userAddress;
      } else if (typeof object.data.owner === "object" && "AddressOwner" in object.data.owner) {
        return (object.data.owner as any).AddressOwner === userAddress;
      }

      return false;
    } catch (error) {
      console.error("Failed to check object ownership:", error);
      return false;
    }
  }

  /**
   * 트랜잭션 결과 조회
   */
  async getTransactionResult(digest: string): Promise<any> {
    try {
      const result = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });

      return result;
    } catch (error) {
      console.error("Failed to get transaction result:", error);
      return null;
    }
  }
}

export const suiObjectManager = new SuiObjectManager();
