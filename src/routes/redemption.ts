import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import { Point } from "../entities/Point";
import { EscrowAccount } from "../entities/EscrowAccount";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

export const redemptionRouter = Router();

// 일회용 토큰 생성 스키마
const generateTokenSchema = z.object({
  objectId: z.number(),
});

// 토큰 검증 및 사용 스키마
const redeemTokenSchema = z.object({
  token: z.string(),
  merchantId: z.number().optional(), // 가맹점 ID (선택사항)
});

/**
 * @openapi
 * /redemption/generate-token:
 *   post:
 *     tags:
 *       - 6️⃣ 쿠폰 사용
 *     summary: 일회용 토큰 생성
 *     description: 오브젝트 보유자가 5분짜리 일회용 토큰을 생성합니다
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
 *                 description: 사용할 오브젝트 ID
 *     responses:
 *       200:
 *         description: 토큰 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: 일회용 토큰
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: 토큰 만료일
 *                 object:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     couponId:
 *                       type: string
 *                     title:
 *                       type: string
 *                     remaining:
 *                       type: string
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
redemptionRouter.post(
  "/generate-token",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = generateTokenSchema.parse(req.body);
      const userId = req.userId!;

      // 오브젝트 소유권 확인
      const objectRepo = AppDataSource.getRepository(CouponObject);
      const couponObject = await objectRepo.findOne({
        where: {
          id: body.objectId,
          ownerId: userId,
          state: CouponObjectState.CREATED,
        },
      });

      if (!couponObject) {
        return res
          .status(400)
          .json({ error: "Object not found or not owned by you" });
      }

      // 만료일 확인
      if (new Date() > couponObject.expiration) {
        return res.status(400).json({ error: "Object has expired" });
      }

      // 이미 사용된 토큰이 있는지 확인
      if (couponObject.jti) {
        return res
          .status(400)
          .json({ error: "Object already has a pending token" });
      }

      // JTI 생성 (고유한 일회용 토큰 ID)
      const jti = uuidv4();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

      // 일회용 토큰 생성
      const token = jwt.sign(
        {
          jti,
          objectId: body.objectId,
          userId,
          remaining: couponObject.remaining,
          exp: Math.floor(expiresAt.getTime() / 1000), // 5분 후 만료
        },
        process.env.SESSION_SECRET || "your-secret-key-here",
        {
          algorithm: "HS256",
          issuer: "coutainer-coupon-system",
        }
      );

      // 오브젝트에 JTI 저장
      await objectRepo.update(
        { id: body.objectId },
        {
          jti,
          updatedAt: new Date(),
        }
      );

      console.log("🎫 일회용 토큰 생성:", {
        objectId: body.objectId,
        couponId: couponObject.couponId,
        userId,
        jti,
        expiresAt,
        remaining: couponObject.remaining,
      });

      res.json({
        token,
        expiresAt,
        object: {
          id: couponObject.id,
          couponId: couponObject.couponId,
          title: couponObject.title,
          remaining: couponObject.remaining,
        },
      });
    } catch (err: any) {
      console.error("토큰 생성 오류:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /redemption/verify-token:
 *   post:
 *     tags:
 *       - 6️⃣ 쿠폰 사용
 *     summary: 토큰 검증 (가맹점용)
 *     description: 가맹점에서 일회용 토큰을 검증하고 사용합니다
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 검증할 일회용 토큰
 *               merchantId:
 *                 type: number
 *                 description: 가맹점 ID (선택사항)
 *     responses:
 *       200:
 *         description: 토큰 검증 및 사용 성공
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
 *                     remaining:
 *                       type: string
 *                     state:
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
redemptionRouter.post("/verify-token", async (req, res) => {
  try {
    const body = redeemTokenSchema.parse(req.body);
    const { token } = body;

    // 토큰 검증
    let decoded: any;
    try {
      decoded = jwt.verify(
        token,
        process.env.SESSION_SECRET || "your-secret-key-here"
      );
    } catch (jwtError) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const { jti, objectId, userId, remaining } = decoded;

    // 오브젝트 조회
    const objectRepo = AppDataSource.getRepository(CouponObject);
    const couponObject = await objectRepo.findOne({
      where: {
        id: objectId,
        jti,
        state: CouponObjectState.CREATED,
      },
      relations: ["supplier", "stamp"],
    });

    if (!couponObject) {
      return res
        .status(400)
        .json({ error: "Object not found or already used" });
    }

    // 만료일 확인
    if (new Date() > couponObject.expiration) {
      return res.status(400).json({ error: "Object has expired" });
    }

    // JTI 중복 사용 확인 (이미 사용된 토큰인지 확인)
    if (couponObject.usedAt) {
      return res.status(400).json({ error: "Token already used" });
    }

    // 트랜잭션 시작
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Escrow에서 공급자에게 remaining 전액 지급
      const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
      const escrowAccount = await escrowRepo.findOne({
        where: { supplierId: couponObject.supplierId },
      });

      if (escrowAccount && BigInt(escrowAccount.balance) >= BigInt(remaining)) {
        // 공급자 포인트 증가
        const pointRepo = queryRunner.manager.getRepository(Point);
        const userRepo = queryRunner.manager.getRepository(User);
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
                BigInt(supplierPoints.balance) + BigInt(remaining)
              ).toString(),
              updatedAt: new Date(),
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: supplier.address,
            balance: remaining,
            updatedAt: new Date(),
          });
        }

        // Escrow 잔액 차감
        const newEscrowBalance =
          BigInt(escrowAccount.balance) - BigInt(remaining);
        await queryRunner.manager.update(
          EscrowAccount,
          { id: escrowAccount.id },
          {
            balance: newEscrowBalance.toString(),
            totalReleased: (
              BigInt(escrowAccount.totalReleased) + BigInt(remaining)
            ).toString(),
            updatedAt: new Date(),
          }
        );
      }

      // 2. 오브젝트 상태를 REDEEMED로 변경
      await queryRunner.manager.update(
        CouponObject,
        { id: objectId },
        {
          state: CouponObjectState.REDEEMED,
          remaining: "0",
          usedAt: new Date(),
          updatedAt: new Date(),
        }
      );

      await queryRunner.commitTransaction();

      // 포인트 이동 내역 생성
      const pointMovements = [
        {
          from: `escrow_${escrowAccount?.id}`,
          to: `supplier_${couponObject.supplierId}`,
          amount: remaining,
          description: "쿠폰 사용 완료 - remaining 전액 지급",
        },
      ];

      console.log("✅ 쿠폰 사용 완료:", {
        objectId,
        couponId: couponObject.couponId,
        jti,
        userId,
        remaining,
        supplier: couponObject.supplierId,
        merchantId: body.merchantId,
      });

      res.json({
        message: "Token verified and coupon redeemed successfully",
        object: {
          id: couponObject.id,
          couponId: couponObject.couponId,
          title: couponObject.title,
          remaining: "0",
          state: CouponObjectState.REDEEMED,
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
    console.error("토큰 검증 오류:", err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /redemption/expire-objects:
 *   post:
 *     tags:
 *       - 6️⃣ 쿠폰 사용
 *     summary: 만료된 오브젝트 처리
 *     description: 만료된 오브젝트들을 처리하고 remaining을 발행자에게 환급합니다
 *     responses:
 *       200:
 *         description: 만료 처리 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expiredCount:
 *                   type: number
 *                 refundedAmount:
 *                   type: string
 *       500:
 *         description: 서버 오류
 */
redemptionRouter.post("/expire-objects", async (req, res) => {
  try {
    const now = new Date();

    // 만료된 오브젝트 조회
    const objectRepo = AppDataSource.getRepository(CouponObject);
    const expiredObjects = await objectRepo.find({
      where: {
        state: CouponObjectState.CREATED,
        expiration: { $lt: now } as any, // TypeORM에서 LessThan 사용
      },
      relations: ["issuer", "supplier"],
    });

    if (expiredObjects.length === 0) {
      return res.json({
        message: "No expired objects found",
        expiredCount: 0,
        refundedAmount: "0",
      });
    }

    // 트랜잭션 시작
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalRefunded = BigInt(0);

      for (const obj of expiredObjects) {
        // 1. 발행자에게 remaining 환급
        const pointRepo = queryRunner.manager.getRepository(Point);
        const userRepo = queryRunner.manager.getRepository(User);
        const issuer = await userRepo.findOne({ where: { id: obj.issuerId } });
        if (!issuer) {
          throw new Error("Issuer not found");
        }

        const issuerPoints = await pointRepo.findOne({
          where: { userAddress: issuer.address },
        });

        if (issuerPoints) {
          await queryRunner.manager.update(
            Point,
            { userAddress: issuer.address },
            {
              balance: (
                BigInt(issuerPoints.balance) + BigInt(obj.remaining)
              ).toString(),
              updatedAt: new Date(),
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: issuer.address,
            balance: obj.remaining,
            updatedAt: new Date(),
          });
        }

        // 2. Escrow에서 환급 금액 차감
        const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
        const escrowAccount = await escrowRepo.findOne({
          where: { supplierId: obj.supplierId },
        });

        if (escrowAccount) {
          const newEscrowBalance =
            BigInt(escrowAccount.balance) - BigInt(obj.remaining);
          await queryRunner.manager.update(
            EscrowAccount,
            { id: escrowAccount.id },
            {
              balance: newEscrowBalance.toString(),
              totalReleased: (
                BigInt(escrowAccount.totalReleased) + BigInt(obj.remaining)
              ).toString(),
              updatedAt: new Date(),
            }
          );
        }

        // 3. 오브젝트 상태를 EXPIRED로 변경
        await queryRunner.manager.update(
          CouponObject,
          { id: obj.id },
          {
            state: CouponObjectState.EXPIRED,
            remaining: "0",
            updatedAt: new Date(),
          }
        );

        totalRefunded += BigInt(obj.remaining);
      }

      await queryRunner.commitTransaction();

      console.log("⏰ 만료된 오브젝트 처리 완료:", {
        expiredCount: expiredObjects.length,
        refundedAmount: totalRefunded.toString(),
      });

      res.json({
        message: "Expired objects processed successfully",
        expiredCount: expiredObjects.length,
        refundedAmount: totalRefunded.toString(),
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  } catch (err: any) {
    console.error("만료 처리 오류:", err);
    res.status(500).json({ error: err.message });
  }
});
