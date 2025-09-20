import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { IssuanceStamp } from "../entities/IssuanceStamp";
import { EscrowAccount } from "../entities/EscrowAccount";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import { Point } from "../entities/Point";
import {
  requireUser,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

export const issuanceRouter = Router();

// 발행 권한 도장 생성 스키마
const createStampSchema = z.object({
  issuerId: z.number(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  maxCount: z.number().min(1),
  faceValue: z.string().min(1), // 포인트 단위
  expiresAt: z.string().datetime(), // ISO 8601 형식
});

// 오브젝트 발행 스키마
const issueObjectSchema = z.object({
  stampId: z.number(),
  recipientId: z.number(),
});

/**
 * @openapi
 * /issuance/create-stamp:
 *   post:
 *     tags:
 *       - 4️⃣ 발행 관리
 *     summary: 발행 권한 도장 생성 (공급자 전용)
 *     description: 공급자가 발행자에게 발행 권한을 위임하는 도장을 생성합니다
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
 *               - issuerId
 *               - title
 *               - maxCount
 *               - faceValue
 *               - expiresAt
 *             properties:
 *               issuerId:
 *                 type: number
 *                 description: 발행자 사용자 ID
 *               title:
 *                 type: string
 *                 description: 상품 제목
 *               description:
 *                 type: string
 *                 description: 상품 설명
 *               imageUrl:
 *                 type: string
 *                 description: 상품 이미지 URL
 *               maxCount:
 *                 type: number
 *                 description: 최대 발행 수량
 *               faceValue:
 *                 type: string
 *                 description: 쿠폰 1장당 가치 (포인트)
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: 만료일
 *     responses:
 *       200:
 *         description: 도장 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stamp:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     title:
 *                       type: string
 *                     faceValue:
 *                       type: string
 *                     maxCount:
 *                       type: number
 *                     totalValue:
 *                       type: string
 *                 escrowAccount:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     balance:
 *                       type: string
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
issuanceRouter.post(
  "/create-stamp",
  requireAdmin, // 공급자 전용
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = createStampSchema.parse(req.body);
      // 공급자 정보 조회
      const userRepo = AppDataSource.getRepository(User);
      const supplier = await userRepo.findOne({ where: { id: req.userId! } });
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }

      // 발행자 확인
      const issuer = await userRepo.findOne({ where: { id: body.issuerId } });
      if (!issuer) {
        return res.status(400).json({ error: "Issuer not found" });
      }

      // 총 예치 금액 계산
      const totalValue = BigInt(body.faceValue) * BigInt(body.maxCount);

      // Escrow 계정 생성 또는 조회
      const escrowRepo = AppDataSource.getRepository(EscrowAccount);
      let escrowAccount = await escrowRepo.findOne({
        where: { supplierAddress: supplier.address },
      });

      if (!escrowAccount) {
        escrowAccount = escrowRepo.create({
          supplierAddress: supplier.address,
          balance: "0",
        });
        await escrowRepo.save(escrowAccount);
      }

      // 발행 권한 도장 생성
      const stampRepo = AppDataSource.getRepository(IssuanceStamp);
      const stamp = stampRepo.create({
        supplierId: supplier.id,
        issuerId: body.issuerId,
        title: body.title,
        description: body.description || null,
        imageUrl: body.imageUrl || null,
        maxCount: body.maxCount,
        issuedCount: 0,
        faceValue: body.faceValue,
        totalValue: totalValue.toString(),
        remainingValue: totalValue.toString(),
        expiresAt: new Date(body.expiresAt),
        isActive: true,
      });

      await stampRepo.save(stamp);

      console.log("📋 발행 권한 도장 생성:", {
        stampId: stamp.id,
        supplier: supplier.id,
        issuer: body.issuerId,
        title: body.title,
        faceValue: body.faceValue,
        maxCount: body.maxCount,
        totalValue: totalValue.toString(),
      });

      res.json({
        stamp: {
          id: stamp.id,
          title: stamp.title,
          faceValue: stamp.faceValue,
          maxCount: stamp.maxCount,
          totalValue: stamp.totalValue,
          expiresAt: stamp.expiresAt,
        },
        escrowAccount: {
          id: escrowAccount.id,
          balance: escrowAccount.balance,
        },
      });
    } catch (err: any) {
      console.error("발행 권한 도장 생성 오류:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /issuance/issue-object:
 *   post:
 *     tags:
 *       - 4️⃣ 발행 관리
 *     summary: 오브젝트 발행 (발행자 전용)
 *     description: 발행자가 권한 도장을 사용하여 오브젝트를 발행합니다
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
 *               - stampId
 *               - recipientId
 *             properties:
 *               stampId:
 *                 type: number
 *                 description: 발행 권한 도장 ID
 *               recipientId:
 *                 type: number
 *                 description: 수령자 사용자 ID
 *     responses:
 *       200:
 *         description: 오브젝트 발행 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 object:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     objectId:
 *                       type: string
 *                     title:
 *                       type: string
 *                     faceValue:
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
issuanceRouter.post(
  "/issue-object",
  requireUser, // 발행자 전용
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = issueObjectSchema.parse(req.body);
      const issuerId = req.userId!;

      // 발행 권한 도장 확인
      const stampRepo = AppDataSource.getRepository(IssuanceStamp);
      const stamp = await stampRepo.findOne({
        where: {
          id: body.stampId,
          issuerId,
          isActive: true,
        },
      });

      if (!stamp) {
        return res
          .status(400)
          .json({ error: "Invalid stamp or not authorized" });
      }

      // 발행 수량 확인
      if (stamp.issuedCount >= stamp.maxCount) {
        return res
          .status(400)
          .json({ error: "Maximum issuance count exceeded" });
      }

      // 만료일 확인
      if (new Date() > stamp.expiresAt) {
        return res.status(400).json({ error: "Stamp has expired" });
      }

      // 수령자 확인
      const userRepo = AppDataSource.getRepository(User);
      const recipient = await userRepo.findOne({
        where: { id: body.recipientId },
      });
      if (!recipient) {
        return res.status(400).json({ error: "Recipient not found" });
      }

      // 발행자 정보 조회
      const issuer = await userRepo.findOne({
        where: { id: issuerId },
      });
      if (!issuer) {
        return res.status(400).json({ error: "Issuer not found" });
      }

      // 공급자 정보 조회
      const supplier = await userRepo.findOne({
        where: { id: stamp.supplierId },
      });
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }

      // 발행자 포인트 잔액 확인
      const pointRepo = AppDataSource.getRepository(Point);

      const issuerPoints = await pointRepo.findOne({
        where: { userAddress: issuer.address },
      });

      if (
        !issuerPoints ||
        BigInt(issuerPoints.balance) < BigInt(stamp.faceValue)
      ) {
        return res.status(400).json({ error: "Insufficient points" });
      }

      // 트랜잭션 시작
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 1. 발행자 포인트 차감 (face_value)
        await queryRunner.manager.update(
          Point,
          { userAddress: issuer.address },
          {
            balance: (
              BigInt(issuerPoints.balance) - BigInt(stamp.faceValue)
            ).toString(),
          }
        );

        // 2. Escrow 계정에 포인트 예치
        const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
        const escrowAccount = await escrowRepo.findOne({
          where: { supplierAddress: stamp.supplier.address },
        });

        if (!escrowAccount) {
          throw new Error("Escrow account not found");
        }

        const newEscrowBalance =
          BigInt(escrowAccount.balance) + BigInt(stamp.faceValue);
        await queryRunner.manager.update(
          EscrowAccount,
          { id: escrowAccount.id },
          {
            balance: newEscrowBalance.toString(),
          }
        );

        // 3. 공급자에게 3% 수수료 지급
        const supplierFee = (BigInt(stamp.faceValue) * BigInt(3)) / BigInt(100);
        const remainingAfterFee = BigInt(stamp.faceValue) - supplierFee;

        const supplier = await userRepo.findOne({
          where: { id: stamp.supplierId },
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
          // 공급자 포인트 계정 생성
          await queryRunner.manager.save(Point, {
            userAddress: supplier.address,
            balance: supplierFee.toString(),
            updatedAt: new Date(),
          });
        }

        // 4. 오브젝트 생성
        const objectRepo = queryRunner.manager.getRepository(CouponObject);
        const objectId = `COUPON_${uuidv4()
          .replace(/-/g, "")
          .substring(0, 16)
          .toUpperCase()}`;

        const couponObject = objectRepo.create({
          objectId,
          ownerId: body.recipientId,
          ownerAddress: recipient.address,
          stampId: stamp.id,
          supplierId: stamp.supplierId,
          supplierAddress: supplier.address,
          issuerId: issuerId,
          issuerAddress: issuer.address,
          title: stamp.title,
          description: stamp.description,
          imageUrl: stamp.imageUrl,
          faceValue: stamp.faceValue,
          remaining: remainingAfterFee.toString(),
          tradeCount: 0,
          state: CouponObjectState.CREATED,
          expiresAt: stamp.expiresAt,
          issuedAt: new Date(),
        });

        await queryRunner.manager.save(couponObject);

        // 5. 도장 발행 수량 증가
        await queryRunner.manager.update(
          IssuanceStamp,
          { id: stamp.id },
          {
            issuedCount: stamp.issuedCount + 1,
            remainingValue: (
              BigInt(stamp.remainingValue) - BigInt(stamp.faceValue)
            ).toString(),
          }
        );

        await queryRunner.commitTransaction();

        // 포인트 이동 내역 생성
        const pointMovements = [
          {
            from: `issuer_${issuerId}`,
            to: `escrow_${escrowAccount.id}`,
            amount: stamp.faceValue,
            description: "오브젝트 발행 예치",
          },
          {
            from: `escrow_${escrowAccount.id}`,
            to: `supplier_${stamp.supplierId}`,
            amount: supplierFee.toString(),
            description: "공급자 수수료 (3%)",
          },
        ];

        console.log("🎫 오브젝트 발행 완료:", {
          id: couponObject.id,
          objectId: couponObject.objectId,
          title: couponObject.title,
          faceValue: couponObject.faceValue,
          remaining: couponObject.remaining,
          recipient: body.recipientId,
          supplierFee: supplierFee.toString(),
        });

        res.json({
          object: {
            id: couponObject.id,
            objectId: couponObject.objectId,
            title: couponObject.title,
            faceValue: couponObject.faceValue,
            remaining: couponObject.remaining,
            state: couponObject.state,
            expiresAt: couponObject.expiresAt,
            product: {
              title: couponObject.title,
              description: couponObject.description,
              imageUrl: couponObject.imageUrl,
            },
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
      console.error("오브젝트 발행 오류:", err);
      res.status(400).json({ error: err.message });
    }
  }
);
