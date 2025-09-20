import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import { TradeTransaction } from "../entities/TradeTransaction";
import { Point } from "../entities/Point";
import { EscrowAccount } from "../entities/EscrowAccount";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { suiObjectManager } from "../sui/object-manager";
import { suiSyncService } from "../sui/sync-service";
import { importKeypairFromMnemonic } from "../sui/wallet";

export const marketplaceRouter = Router();

// 판매 등록 스키마
const listForSaleSchema = z.object({
  objectId: z.string(),
  price: z.string().min(1), // 포인트 단위
});

// 구매 스키마
const buyObjectSchema = z.object({
  objectId: z.string(),
  idempotencyKey: z.string().optional(),
});

/**
 * @openapi
 * /marketplace/list-for-sale:
 *   post:
 *     tags:
 *       - 5️⃣ 거래 마켓플레이스
 *     summary: 오브젝트 판매 등록
 *     description: 사용자가 자신의 오브젝트를 판매 목록에 등록합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - objectId
 *               - price
 *             properties:
 *               objectId:
 *                 type: string
 *                 description: 오브젝트 ID
 *               price:
 *                 type: string
 *                 description: 판매 가격 (포인트)
 *     responses:
 *       200:
 *         description: 판매 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 object:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     objectId:
 *                       type: string
 *                     title:
 *                       type: string
 *                     price:
 *                       type: string
 *                     state:
 *                       type: string
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
marketplaceRouter.post(
  "/list-for-sale",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = listForSaleSchema.parse(req.body);
      const sellerId = req.userId!;

      // 오브젝트 소유권 확인
      const objectRepo = AppDataSource.getRepository(CouponObject);
      const couponObject = await objectRepo.findOne({
        where: {
          objectId: body.objectId,
          ownerId: sellerId,
          state: CouponObjectState.CREATED,
        },
      });

      if (!couponObject) {
        return res
          .status(400)
          .json({ error: "Object not found or not owned by you" });
      }

      // 만료일 확인
      if (new Date() > couponObject.expiresAt) {
        return res.status(400).json({ error: "Object has expired" });
      }

      // 판매 상태로 변경
      await objectRepo.update(
        { objectId: body.objectId },
        {
          state: CouponObjectState.TRADING,
        }
      );

      // Sui 블록체인에 판매 등록 (내부적으로만 처리)
      try {
        const userRepo = AppDataSource.getRepository(User);
        const seller = await userRepo.findOne({ where: { id: sellerId } });
        if (seller?.mnemonic && body.objectId) {
          const keypair = importKeypairFromMnemonic(seller.mnemonic);
          await suiObjectManager.listCouponForSale(
            keypair,
            body.objectId,
            BigInt(body.price)
          );
          console.log("🔗 Sui 블록체인에 판매 등록 완료");
        }
      } catch (error: any) {
        console.warn("Sui 판매 등록 실패 (내부 처리):", error.message);
      }

      console.log("🏪 판매 등록:", {
        requestObjectId: body.objectId,
        objectId: couponObject.objectId,
        seller: sellerId,
        price: body.price,
        title: couponObject.title,
      });

      res.json({
        message: "Object listed for sale successfully",
        object: {
          id: couponObject.id,
          objectId: couponObject.objectId,
          title: couponObject.title,
          price: body.price,
          state: CouponObjectState.TRADING,
        },
      });
    } catch (err: any) {
      console.error("판매 등록 오류:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /marketplace/objects-for-sale:
 *   get:
 *     tags:
 *       - 5️⃣ 거래 마켓플레이스
 *     summary: 판매 중인 오브젝트 목록 조회
 *     description: 현재 판매 중인 모든 오브젝트 목록을 조회합니다
 *     responses:
 *       200:
 *         description: 판매 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   objectId:
 *                     type: string
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 *                   imageUrl:
 *                     type: string
 *                   faceValue:
 *                     type: string
 *                   remaining:
 *                     type: string
 *                   tradeCount:
 *                     type: number
 *                   expiresAt:
 *                     type: string
 *                   owner:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       address:
 *                         type: string
 *       500:
 *         description: 서버 오류
 */
marketplaceRouter.get("/objects-for-sale", async (req, res) => {
  try {
    const objectRepo = AppDataSource.getRepository(CouponObject);
    const objects = await objectRepo.find({
      where: { state: CouponObjectState.TRADING },
      relations: ["owner", "supplier"],
      order: { id: "DESC" },
    });

    const objectsForSale = objects.map((obj) => ({
      id: obj.id,
      objectId: obj.objectId,
      title: obj.title,
      description: obj.description,
      imageUrl: obj.imageUrl,
      faceValue: obj.faceValue,
      remaining: obj.remaining,
      tradeCount: obj.tradeCount,
      expiresAt: obj.expiresAt,
      owner: {
        id: obj.owner.id,
        address: obj.owner.address,
      },
      supplier: {
        id: obj.supplier.id,
        address: obj.supplier.address,
      },
    }));

    res.json(objectsForSale);
  } catch (err: any) {
    console.error("판매 목록 조회 오류:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /marketplace/buy-object:
 *   post:
 *     tags:
 *       - 5️⃣ 거래 마켓플레이스
 *     summary: 오브젝트 구매
 *     description: 판매 중인 오브젝트를 포인트로 구매합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - objectId
 *             properties:
 *               objectId:
 *                 type: string
 *                 description: 구매할 오브젝트 ID
 *               idempotencyKey:
 *                 type: string
 *                 description: 중복 방지 키 (선택사항)
 *     responses:
 *       200:
 *         description: 구매 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     idempotencyKey:
 *                       type: string
 *                     price:
 *                       type: string
 *                     supplierFee:
 *                       type: string
 *                 pointMovements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       from:
 *                         type: string
 *                       to:
 *                         type: string
 *                       amount:
 *                         type: string
 *                       description:
 *                         type: string
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
marketplaceRouter.post(
  "/buy-object",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = buyObjectSchema.parse(req.body);
      const buyerId = req.userId!;
      const idempotencyKey = body.idempotencyKey || uuidv4();

      // 중복 거래 확인
      const transactionRepo = AppDataSource.getRepository(TradeTransaction);
      const existingTransaction = await transactionRepo.findOne({
        where: { idempotencyKey },
      });

      if (existingTransaction) {
        return res
          .status(400)
          .json({ error: "Duplicate transaction detected" });
      }

      // 오브젝트 조회
      const objectRepo = AppDataSource.getRepository(CouponObject);
      const couponObject = await objectRepo.findOne({
        where: {
          objectId: body.objectId,
          state: CouponObjectState.TRADING,
        },
        relations: ["owner", "issuer"],
      });

      if (!couponObject) {
        return res
          .status(400)
          .json({ error: "Object not available for purchase" });
      }

      // 자신의 오브젝트 구매 방지
      if (couponObject.ownerId === buyerId) {
        return res.status(400).json({ error: "Cannot buy your own object" });
      }

      // 만료일 확인
      if (new Date() > couponObject.expiresAt) {
        return res.status(400).json({ error: "Object has expired" });
      }

      // 구매자 포인트 잔액 확인
      const pointRepo = AppDataSource.getRepository(Point);
      const userRepo = AppDataSource.getRepository(User);
      const buyer = await userRepo.findOne({ where: { id: buyerId } });
      if (!buyer) {
        return res.status(400).json({ error: "Buyer not found" });
      }

      const buyerPoints = await pointRepo.findOne({
        where: { userAddress: buyer.address },
      });

      if (
        !buyerPoints ||
        BigInt(buyerPoints.balance) < BigInt(couponObject.faceValue)
      ) {
        return res.status(400).json({ error: "Insufficient points" });
      }

      // 트랜잭션 시작
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 1. 구매자 포인트 차감
        await queryRunner.manager.update(
          Point,
          { userAddress: buyer.address },
          {
            balance: (
              BigInt(buyerPoints.balance) - BigInt(couponObject.faceValue)
            ).toString(),
          }
        );

        // 2. 판매자 포인트 증가
        const seller = await userRepo.findOne({
          where: { id: couponObject.ownerId },
        });
        if (!seller) {
          throw new Error("Seller not found");
        }

        const sellerPoints = await pointRepo.findOne({
          where: { userAddress: seller.address },
        });

        if (sellerPoints) {
          await queryRunner.manager.update(
            Point,
            { userAddress: seller.address },
            {
              balance: (
                BigInt(sellerPoints.balance) + BigInt(couponObject.faceValue)
              ).toString(),
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: seller.address,
            balance: couponObject.faceValue,
          });
        }

        // 3. 공급자에게 3% 수수료 지급
        const supplierFee =
          (BigInt(couponObject.faceValue) * BigInt(3)) / BigInt(100);
        const remainingAfterFee = BigInt(couponObject.remaining) - supplierFee;

        const supplierPoints = await pointRepo.findOne({
          where: { userAddress: couponObject.supplierAddress },
        });

        if (supplierPoints) {
          await queryRunner.manager.update(
            Point,
            { userAddress: couponObject.supplierAddress },
            {
              balance: (
                BigInt(supplierPoints.balance) + supplierFee
              ).toString(),
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: couponObject.supplierAddress,
            balance: supplierFee.toString(),
          });
        }

        // 4. Escrow에서 공급자 수수료 차감
        const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
        const escrowAccount = await escrowRepo.findOne({
          where: { supplierAddress: couponObject.supplierAddress },
        });

        if (escrowAccount) {
          const newEscrowBalance = BigInt(escrowAccount.balance) - supplierFee;
          await queryRunner.manager.update(
            EscrowAccount,
            { id: escrowAccount.id },
            {
              balance: newEscrowBalance.toString(),
            }
          );
        }

        // 5. 오브젝트 소유권 이전
        await queryRunner.manager.update(
          CouponObject,
          { objectId: body.objectId },
          {
            ownerId: buyerId,
            remaining: remainingAfterFee.toString(),
            tradeCount: couponObject.tradeCount + 1,
            state: CouponObjectState.CREATED, // 거래 완료 후 다시 CREATED 상태
          }
        );

        // 6. 거래 기록 저장
        if (!couponObject.objectId) {
          throw new Error("CouponObject objectId is null");
        }

        const tradeTransaction = queryRunner.manager.create(TradeTransaction, {
          idempotencyKey,
          objectId: couponObject.objectId,
          sellerId: couponObject.ownerId,
          buyerId: buyerId,
          price: couponObject.faceValue,
          supplierFee: supplierFee.toString(),
          remainingAfterTrade: remainingAfterFee.toString(),
          processedAt: new Date(),
        });

        await queryRunner.manager.save(tradeTransaction);

        await queryRunner.commitTransaction();

        // Sui 블록체인에서 구매 처리 (내부적으로만 처리)
        try {
          const buyerUser = await userRepo.findOne({ where: { id: buyerId } });
          const sellerUser = await userRepo.findOne({
            where: { id: couponObject.ownerId },
          });

          if (
            buyerUser?.mnemonic &&
            sellerUser?.mnemonic &&
            couponObject.objectId
          ) {
            const buyerKeypair = importKeypairFromMnemonic(buyerUser.mnemonic);
            const sellerKeypair = importKeypairFromMnemonic(
              sellerUser.mnemonic
            );

            // Sui에서 구매 트랜잭션 실행
            await suiObjectManager.buyCoupon(
              buyerKeypair,
              `sale_${couponObject.objectId}`, // 판매 오브젝트 ID (실제로는 저장된 값 사용)
              couponObject.objectId,
              BigInt(couponObject.faceValue)
            );
            console.log("🔗 Sui 블록체인 구매 처리 완료");
          }
        } catch (error: any) {
          console.warn("Sui 구매 처리 실패 (내부 처리):", error.message);
        }

        // 포인트 이동 내역 생성
        const pointMovements = [
          {
            from: `buyer_${buyerId}`,
            to: `seller_${couponObject.ownerId}`,
            amount: couponObject.faceValue,
            description: "오브젝트 구매 대금",
          },
          {
            from: `escrow_${escrowAccount?.id}`,
            to: `supplier_${couponObject.supplierId}`,
            amount: supplierFee.toString(),
            description: "공급자 수수료 (3%)",
          },
        ];

        console.log("💰 오브젝트 구매 완료:", {
          requestObjectId: body.objectId,
          objectId: couponObject.objectId,
          buyer: buyerId,
          seller: couponObject.ownerId,
          price: couponObject.faceValue,
          supplierFee: supplierFee.toString(),
          remainingAfterTrade: remainingAfterFee.toString(),
        });

        res.json({
          message: "Object purchased successfully",
          transaction: {
            id: tradeTransaction.id,
            idempotencyKey: tradeTransaction.idempotencyKey,
            price: tradeTransaction.price,
            supplierFee: tradeTransaction.supplierFee,
          },
          pointMovements,
        });
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (err: any) {
      console.error("오브젝트 구매 오류:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /marketplace/sync:
 *   post:
 *     tags:
 *       - 5️⃣ 거래 마켓플레이스
 *     summary: 마켓플레이스 상태 동기화
 *     description: Sui 블록체인과 마켓플레이스 상태를 동기화합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: 동기화 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 success:
 *                   type: boolean
 *                 syncedObjects:
 *                   type: number
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: 서버 오류
 */
marketplaceRouter.post(
  "/sync",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await suiSyncService.syncMarketplaceStatus();

      res.json({
        message: result.message,
        success: result.success,
        syncedObjects: result.syncedObjects || 0,
        errors: result.errors || [],
      });
    } catch (err: any) {
      console.error("마켓플레이스 동기화 오류:", err);
      res.status(500).json({
        error: err.message,
        success: false,
      });
    }
  }
);

/**
 * @openapi
 * /marketplace/sync-user:
 *   post:
 *     tags:
 *       - 5️⃣ 거래 마켓플레이스
 *     summary: 사용자 지갑 동기화
 *     description: 특정 사용자의 지갑과 Sui 블록체인을 동기화합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: 동기화 성공
 *         content:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 success:
 *                   type: boolean
 *                 syncedObjects:
 *                   type: number
 *                 syncedBalances:
 *                   type: number
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: 서버 오류
 */
marketplaceRouter.post(
  "/sync-user",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const result = await suiSyncService.syncUserWallet(userId);

      res.json({
        message: result.message,
        success: result.success,
        syncedObjects: result.syncedObjects || 0,
        syncedBalances: result.syncedBalances || 0,
        errors: result.errors || [],
      });
    } catch (err: any) {
      console.error("사용자 동기화 오류:", err);
      res.status(500).json({
        error: err.message,
        success: false,
      });
    }
  }
);
