import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import { Point } from "../entities/Point";
import { EscrowAccount } from "../entities/EscrowAccount";
import {
  requireUser,
  requireUserWithRole,
  requireConsumer,
  AuthenticatedRequest,
} from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

export const redemptionRouter = Router();

// 일회용 토큰 생성 스키마
const generateTokenSchema = z.object({
  objectId: z.string(),
});

// 토큰 검증 및 사용 스키마 (공급자 JWT + UUID 토큰)
const redeemTokenSchema = z.object({
  oneTimeToken: z.string(), // UUID 형식의 일회용 토큰
});

/**
 * @openapi
 * /redemption/generate-token:
 *   post:
 *     tags:
 *       - 6️⃣ 쿠폰 사용
 *     summary: 일회용 토큰 생성 (UUID 형식)
 *     description: 오브젝트 보유자가 5분짜리 UUID 형식의 일회용 토큰을 생성합니다
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
 *                 description: 사용할 오브젝트 ID
 *                 example: "COUPON_51AA919D06604133"
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
 *                   description: UUID 형식의 일회용 토큰
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: 토큰 만료일
 *                 object:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     objectId:
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
  requireUserWithRole,
  requireConsumer,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = generateTokenSchema.parse(req.body);
      const userId = req.userId!;

      // 오브젝트 소유권 확인
      const objectRepo = AppDataSource.getRepository(CouponObject);

      // 먼저 오브젝트가 존재하는지 확인
      const objectExists = await objectRepo.findOne({
        where: {
          objectId: body.objectId,
          ownerId: userId,
        },
      });

      if (!objectExists) {
        return res
          .status(400)
          .json({ error: "Object not found or not owned by you" });
      }

      // 상태별 에러 메시지
      if (objectExists.state === CouponObjectState.REDEEMED) {
        return res
          .status(400)
          .json({ error: "This coupon has already been used" });
      }

      if (objectExists.state === CouponObjectState.TRADING) {
        return res
          .status(400)
          .json({ error: "This coupon is currently being traded" });
      }

      if (objectExists.state === CouponObjectState.EXPIRED) {
        return res.status(400).json({ error: "This coupon has expired" });
      }

      // CREATED 상태인 오브젝트만 토큰 생성 가능
      const couponObject = await objectRepo.findOne({
        where: {
          objectId: body.objectId,
          ownerId: userId,
          state: CouponObjectState.CREATED,
        },
      });

      if (!couponObject) {
        return res
          .status(400)
          .json({ error: "Object is not available for token generation" });
      }

      // 만료일 확인
      if (new Date() > couponObject.expiresAt) {
        return res.status(400).json({ error: "Object has expired" });
      }

      // UUID 형식의 일회용 토큰 생성
      const oneTimeToken = uuidv4();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

      // 오브젝트에 JTI 저장 (UUID 토큰)
      await objectRepo.update(
        { objectId: body.objectId },
        {
          jti: oneTimeToken,
        }
      );

      console.log("🎫 일회용 토큰 생성:", {
        requestObjectId: body.objectId,
        objectId: couponObject.objectId,
        userId,
        oneTimeToken,
        expiresAt,
        remaining: couponObject.remaining,
      });

      res.json({
        token: oneTimeToken,
        expiresAt,
        object: {
          id: couponObject.id,
          objectId: couponObject.objectId,
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
 *     summary: 토큰 검증 (공급자용)
 *     description: 공급자가 JWT 헤더와 UUID 형식의 일회용 토큰으로 쿠폰을 검증하고 사용 처리합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         required: true
 *         schema:
 *           type: string
 *         description: 공급자 JWT 토큰
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oneTimeToken
 *             properties:
 *               oneTimeToken:
 *                 type: string
 *                 description: UUID 형식의 일회용 토큰
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
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
 *                     objectId:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   examples:
 *                     - "One-time token not found or invalid"
 *                     - "This coupon has already been used"
 *                     - "This coupon is currently being traded"
 *                     - "This coupon has expired"
 *                     - "Object has expired"
 *                     - "Token already used"
 *       403:
 *         description: 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "You can only verify your own coupons"
 *       500:
 *         description: 서버 오류
 */
redemptionRouter.post(
  "/verify-token",
  requireUserWithRole, // 공급자 JWT 헤더 확인
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = redeemTokenSchema.parse(req.body);
      const { oneTimeToken } = body;

      // 오브젝트 조회 (UUID 토큰으로만 조회)
      const objectRepo = AppDataSource.getRepository(CouponObject);
      const couponObject = await objectRepo.findOne({
        where: {
          jti: oneTimeToken,
        },
      });

      if (!couponObject) {
        return res
          .status(400)
          .json({ error: "One-time token not found or invalid" });
      }

      // 공급자 권한 확인 (공급자만 자신의 쿠폰을 검증할 수 있음)
      if (couponObject.supplierAddress !== req.userAddress) {
        return res
          .status(403)
          .json({ error: "You can only verify your own coupons" });
      }

      // 쿠폰 상태 확인
      if (couponObject.state === CouponObjectState.REDEEMED) {
        return res
          .status(400)
          .json({ error: "This coupon has already been used" });
      }

      if (couponObject.state === CouponObjectState.TRADING) {
        return res
          .status(400)
          .json({ error: "This coupon is currently being traded" });
      }

      if (couponObject.state === CouponObjectState.EXPIRED) {
        return res.status(400).json({ error: "This coupon has expired" });
      }

      // 만료일 확인
      if (new Date() > couponObject.expiresAt) {
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
          where: { supplierAddress: couponObject.supplierAddress },
        });

        if (
          escrowAccount &&
          BigInt(escrowAccount.balance) >= BigInt(couponObject.remaining)
        ) {
          // 공급자 포인트 증가
          const pointRepo = queryRunner.manager.getRepository(Point);

          const supplierPoints = await pointRepo.findOne({
            where: { userAddress: couponObject.supplierAddress },
          });

          if (supplierPoints) {
            await queryRunner.manager.update(
              Point,
              { userAddress: couponObject.supplierAddress },
              {
                balance: (
                  BigInt(supplierPoints.balance) +
                  BigInt(couponObject.remaining)
                ).toString(),
              }
            );
          } else {
            await queryRunner.manager.save(Point, {
              userAddress: couponObject.supplierAddress,
              balance: couponObject.remaining,
            });
          }

          // Escrow 잔액 차감
          const newEscrowBalance =
            BigInt(escrowAccount.balance) - BigInt(couponObject.remaining);
          await queryRunner.manager.update(
            EscrowAccount,
            { id: escrowAccount.id },
            {
              balance: newEscrowBalance.toString(),
            }
          );
        }

        // 2. 오브젝트 상태를 REDEEMED로 변경
        await queryRunner.manager.update(
          CouponObject,
          { objectId: couponObject.objectId },
          {
            state: CouponObjectState.REDEEMED,
            remaining: "0",
            usedAt: new Date(),
          }
        );

        await queryRunner.commitTransaction();

        // 포인트 이동 내역 생성
        const pointMovements = [
          {
            from: `escrow_${escrowAccount?.id}`,
            to: `supplier_${couponObject.supplierId}`,
            amount: couponObject.remaining,
            description: "쿠폰 사용 완료 - remaining 전액 지급",
          },
        ];

        console.log("✅ 쿠폰 사용 완료:", {
          objectId: couponObject.objectId,
          jti: couponObject.jti,
          remaining: couponObject.remaining,
          supplier: couponObject.supplierId,
        });

        res.json({
          message: "Token verified and coupon redeemed successfully",
          object: {
            id: couponObject.id,
            objectId: couponObject.objectId,
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
  }
);

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
        expiresAt: { $lt: now } as any, // TypeORM에서 LessThan 사용
      },
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
            }
          );
        } else {
          await queryRunner.manager.save(Point, {
            userAddress: issuer.address,
            balance: obj.remaining,
          });
        }

        // 2. Escrow에서 환급 금액 차감
        const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
        const escrowAccount = await escrowRepo.findOne({
          where: { supplierAddress: obj.supplierAddress },
        });

        if (escrowAccount) {
          const newEscrowBalance =
            BigInt(escrowAccount.balance) - BigInt(obj.remaining);
          await queryRunner.manager.update(
            EscrowAccount,
            { id: escrowAccount.id },
            {
              balance: newEscrowBalance.toString(),
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
