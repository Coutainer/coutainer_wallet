import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import { TradeTransaction } from "../entities/TradeTransaction";
import { Point } from "../entities/Point";
import { suiObjectManager } from "./object-manager";
import { suiWalletManager } from "./wallet-manager";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { importKeypairFromMnemonic } from "./wallet";

export interface SyncResult {
  success: boolean;
  message: string;
  syncedObjects?: number;
  syncedBalances?: number;
  errors?: string[];
}

export class SuiSyncService {
  /**
   * 사용자 지갑과 Sui 블록체인 동기화
   */
  async syncUserWallet(userId: number): Promise<SyncResult> {
    const errors: string[] = [];
    let syncedObjects = 0;
    let syncedBalances = 0;

    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        return {
          success: false,
          message: "User not found",
          errors: ["User not found"],
        };
      }

      // 1. 지갑 잔액 동기화
      if (user.hasWallet && user.address) {
        try {
          const walletInfo = await suiWalletManager.getWalletInfo(user.address);
          console.log(
            `🔄 동기화 중 - 사용자 ${user.address} 잔액: ${walletInfo.balance}`
          );
          syncedBalances++;
        } catch (error: any) {
          errors.push(
            `Balance sync failed for ${user.address}: ${error.message}`
          );
        }
      }

      // 2. 사용자의 쿠폰 오브젝트 동기화
      if (user.hasWallet && user.mnemonic && user.address) {
        try {
          const keypair = importKeypairFromMnemonic(user.mnemonic);
          const suiCoupons = await suiObjectManager.getUserCouponObjects(
            user.address
          );

          const couponRepo = AppDataSource.getRepository(CouponObject);

          for (const suiCoupon of suiCoupons) {
            // 데이터베이스에서 해당 오브젝트 찾기
            const existingCoupon = await couponRepo.findOne({
              where: { objectId: suiCoupon.id },
            });

            if (existingCoupon) {
              // 상태 동기화
              const newState = suiCoupon.used
                ? CouponObjectState.REDEEMED
                : CouponObjectState.CREATED;

              if (existingCoupon.state !== newState) {
                await couponRepo.update(
                  { id: existingCoupon.id },
                  { state: newState }
                );
                console.log(
                  `📝 오브젝트 ${suiCoupon.id} 상태 동기화: ${existingCoupon.state} → ${newState}`
                );
                syncedObjects++;
              }
            } else {
              // 새로운 오브젝트 생성 (기본 정보만)
              await couponRepo.save({
                objectId: suiCoupon.id,
                ownerAddress: user.address,
                supplierAddress: suiCoupon.provider,
                issuerAddress: suiCoupon.issuer,
                title: `Sui Coupon ${suiCoupon.couponType}`,
                description: "Synced from Sui blockchain",
                faceValue: suiCoupon.value.toString(),
                remaining: suiCoupon.value.toString(),
                state: suiCoupon.used
                  ? CouponObjectState.REDEEMED
                  : CouponObjectState.CREATED,
                expiresAt: new Date(Number(suiCoupon.expiryTime)),
                issuedAt: new Date(),
                ownerId: user.id,
                supplierId: user.id, // 임시로 같은 사용자로 설정
                issuerId: user.id,
              });
              console.log(`🆕 새 오브젝트 생성: ${suiCoupon.id}`);
              syncedObjects++;
            }
          }
        } catch (error: any) {
          errors.push(
            `Coupon sync failed for ${user.address}: ${error.message}`
          );
        }
      }

      const success = errors.length === 0;
      const message = success
        ? `Successfully synced ${syncedObjects} objects and ${syncedBalances} balances`
        : `Sync completed with ${errors.length} errors`;

      return {
        success,
        message,
        syncedObjects,
        syncedBalances,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Sync failed",
        errors: [error.message],
      };
    }
  }

  /**
   * 모든 사용자 지갑 동기화
   */
  async syncAllWallets(): Promise<SyncResult> {
    const errors: string[] = [];
    let totalSyncedObjects = 0;
    let totalSyncedBalances = 0;
    let syncedUsers = 0;

    try {
      const userRepo = AppDataSource.getRepository(User);
      const users = await userRepo.find({
        where: { hasWallet: true },
      });

      console.log(`🔄 ${users.length}명의 사용자 지갑 동기화 시작`);

      for (const user of users) {
        try {
          const result = await this.syncUserWallet(user.id);

          if (result.success) {
            totalSyncedObjects += result.syncedObjects || 0;
            totalSyncedBalances += result.syncedBalances || 0;
            syncedUsers++;
          } else {
            errors.push(...(result.errors || []));
          }
        } catch (error: any) {
          errors.push(`User ${user.id} sync failed: ${error.message}`);
        }
      }

      const success = errors.length === 0;
      const message = success
        ? `Successfully synced ${syncedUsers} users, ${totalSyncedObjects} objects, and ${totalSyncedBalances} balances`
        : `Sync completed with ${errors.length} errors`;

      return {
        success,
        message,
        syncedObjects: totalSyncedObjects,
        syncedBalances: totalSyncedBalances,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Bulk sync failed",
        errors: [error.message],
      };
    }
  }

  /**
   * 특정 오브젝트 상태 동기화
   */
  async syncObjectStatus(objectId: string): Promise<SyncResult> {
    try {
      const couponRepo = AppDataSource.getRepository(CouponObject);
      const coupon = await couponRepo.findOne({
        where: { objectId },
        relations: ["owner"],
      });

      if (!coupon) {
        return {
          success: false,
          message: "Object not found in database",
        };
      }

      if (!coupon.owner?.mnemonic) {
        return {
          success: false,
          message: "Owner mnemonic not available",
        };
      }

      // Sui에서 오브젝트 정보 조회
      const suiObject = await suiObjectManager.getObjectInfo(objectId);

      if (!suiObject || !suiObject.data) {
        return {
          success: false,
          message: "Object not found on Sui blockchain",
        };
      }

      // 상태 비교 및 업데이트
      const fields = suiObject.data.content?.fields;
      if (fields) {
        const isUsed = fields.used === true;
        const newState = isUsed
          ? CouponObjectState.REDEEMED
          : CouponObjectState.CREATED;

        if (coupon.state !== newState) {
          await couponRepo.update({ id: coupon.id }, { state: newState });

          console.log(
            `📝 오브젝트 ${objectId} 상태 동기화: ${coupon.state} → ${newState}`
          );

          return {
            success: true,
            message: `Object state synced: ${coupon.state} → ${newState}`,
            syncedObjects: 1,
          };
        }
      }

      return {
        success: true,
        message: "Object is already up to date",
        syncedObjects: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Object sync failed",
        errors: [error.message],
      };
    }
  }

  /**
   * 마켓플레이스 상태 동기화
   */
  async syncMarketplaceStatus(): Promise<SyncResult> {
    try {
      const couponRepo = AppDataSource.getRepository(CouponObject);
      const tradingObjects = await couponRepo.find({
        where: { state: CouponObjectState.TRADING },
      });

      let syncedObjects = 0;
      const errors: string[] = [];

      for (const coupon of tradingObjects) {
        if (!coupon.objectId) continue;

        try {
          const suiObject = await suiObjectManager.getObjectInfo(
            coupon.objectId
          );

          if (!suiObject || !suiObject.data) {
            // 오브젝트가 블록체인에 없으면 상태를 CREATED로 변경
            await couponRepo.update(
              { id: coupon.id },
              { state: CouponObjectState.CREATED }
            );
            console.log(
              `📝 오브젝트 ${coupon.objectId} 상태 변경: TRADING → CREATED (블록체인에서 찾을 수 없음)`
            );
            syncedObjects++;
            continue;
          }

          const fields = suiObject.data.content?.fields;
          if (fields && fields.used === true) {
            // 사용된 오브젝트는 REDEEMED 상태로 변경
            await couponRepo.update(
              { id: coupon.id },
              { state: CouponObjectState.REDEEMED }
            );
            console.log(
              `📝 오브젝트 ${coupon.objectId} 상태 변경: TRADING → REDEEMED`
            );
            syncedObjects++;
          }
        } catch (error: any) {
          errors.push(
            `Object ${coupon.objectId} sync failed: ${error.message}`
          );
        }
      }

      const success = errors.length === 0;
      const message = success
        ? `Successfully synced ${syncedObjects} marketplace objects`
        : `Marketplace sync completed with ${errors.length} errors`;

      return {
        success,
        message,
        syncedObjects,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Marketplace sync failed",
        errors: [error.message],
      };
    }
  }

  /**
   * 네트워크 상태 확인
   */
  async checkNetworkStatus(): Promise<{
    connected: boolean;
    chainId: string;
    version: string;
    epoch: number;
  }> {
    try {
      const networkInfo = await suiWalletManager.getNetworkInfo();

      // chainId가 있으면 연결된 것으로 간주
      const connected = !!(
        networkInfo.chainId && networkInfo.chainId !== "unknown"
      );

      return {
        connected: connected,
        ...networkInfo,
      };
    } catch (error) {
      console.error("Network status check failed:", error);
      return {
        connected: false,
        chainId: "unknown",
        version: "unknown",
        epoch: 0,
      };
    }
  }

  /**
   * 정기 동기화 작업 (스케줄러에서 호출)
   */
  async performScheduledSync(): Promise<void> {
    console.log("🔄 정기 동기화 시작");

    try {
      // 1. 네트워크 상태 확인
      const networkStatus = await this.checkNetworkStatus();
      if (!networkStatus.connected) {
        console.error("❌ Sui 네트워크 연결 실패");
        return;
      }

      // 2. 마켓플레이스 상태 동기화
      const marketplaceResult = await this.syncMarketplaceStatus();
      console.log(`📊 마켓플레이스 동기화: ${marketplaceResult.message}`);

      // 3. 모든 사용자 지갑 동기화 (선택적)
      // const userResult = await this.syncAllWallets();
      // console.log(`👥 사용자 동기화: ${userResult.message}`);

      console.log("✅ 정기 동기화 완료");
    } catch (error: any) {
      console.error("❌ 정기 동기화 실패:", error.message);
    }
  }
}

export const suiSyncService = new SuiSyncService();
