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

export const marketplaceRouter = Router();

// 판매 등록 스키마
const listForSaleSchema = z.object({
  objectId: z.number(),
  price: z.string().min(1), // 포인트 단위
});

// 구매 스키마
const buyObjectSchema = z.object({
  objectId: z.number(),
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
 *                 type: number
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
 *                     couponId:
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
          id: body.objectId,
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
        { id: body.objectId },
        {
          state: CouponObjectState.TRANSFERRED,
        }
      );

      console.log("🏪 판매 등록:", {
        objectId: body.objectId,
        couponId: couponObject.couponId,
        seller: sellerId,
        price: body.price,
        title: couponObject.title,
      });

      res.json({
        message: "Object listed for sale successfully",
        object: {
          id: couponObject.id,
          couponId: couponObject.couponId,
          title: couponObject.title,
          price: body.price,
          state: CouponObjectState.TRANSFERRED,
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
 *                   couponId:
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
      where: { state: CouponObjectState.TRANSFERRED },
      relations: ["owner", "supplier", "issuer"],
      order: { id: "DESC" },
    });

    const objectsForSale = objects.map((obj) => ({
      id: obj.id,
      couponId: obj.couponId,
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
 *                 type: number
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
          id: body.objectId,
          state: CouponObjectState.TRANSFERRED,
        },
        relations: ["owner", "supplier", "stamp"],
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

        const supplier = await userRepo.findOne({
          where: { id: couponObject.supplierId },
        });
        if (!supplier) {
          throw new Error("Supplier not found");
        }

        const supplierPoints = await pointRepo.findOne({
          where: { userAddress: supplier.address },
        });

        if (supplierPoints) {
          await queryRunner.manager.update(
            Point,
            { userAddress: supplier.address },
            {
              balance: (
                BigInt(supplierPoints.balance) + supplierFee
              ).toString(),
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: supplier.address,
            balance: supplierFee.toString(),
          });
        }

        // 4. Escrow에서 공급자 수수료 차감
        const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
        const escrowAccount = await escrowRepo.findOne({
          where: { supplierAddress: couponObject.supplier.address },
        });

        if (escrowAccount) {
          const newEscrowBalance = BigInt(escrowAccount.balance) - supplierFee;
          await queryRunner.manager.update(
            EscrowAccount,
            { id: escrowAccount.id },
            {
              balance: newEscrowBalance.toString(),
              totalReleased: (
                BigInt(escrowAccount.totalReleased) + supplierFee
              ).toString(),
            }
          );
        }

        // 5. 오브젝트 소유권 이전
        await queryRunner.manager.update(
          CouponObject,
          { id: body.objectId },
          {
            ownerId: buyerId,
            remaining: remainingAfterFee.toString(),
            tradeCount: couponObject.tradeCount + 1,
            state: CouponObjectState.CREATED, // 거래 완료 후 다시 CREATED 상태
          }
        );

        // 6. 거래 기록 저장
        const tradeTransaction = queryRunner.manager.create(TradeTransaction, {
          idempotencyKey,
          objectId: body.objectId,
          sellerId: couponObject.ownerId,
          buyerId: buyerId,
          price: couponObject.faceValue,
          supplierFee: supplierFee.toString(),
          remainingAfterTrade: remainingAfterFee.toString(),
          processedAt: new Date(),
        });

        await queryRunner.manager.save(tradeTransaction);

        await queryRunner.commitTransaction();

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
          objectId: body.objectId,
          couponId: couponObject.couponId,
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
