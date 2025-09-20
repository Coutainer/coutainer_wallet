import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { SupplierPermit, PermitStatus } from "../entities/SupplierPermit";
import { SupplierCap, CapStatus } from "../entities/SupplierCap";
import { Point } from "../entities/Point";
import { EscrowAccount } from "../entities/EscrowAccount";
import { CouponObject, CouponObjectState } from "../entities/CouponObject";
import {
  requireUser,
  requireUserWithRole,
  requireBusiness,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { DataSource } from "typeorm";

export const permitRouter = Router();

// Permit 상장 스키마
const listPermitSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  scope: z.string().min(1).max(100),
  limit: z.string().min(1),
  faceValue: z.string().min(1),
  price: z.string().min(1),
  expiry: z.string().datetime(),
});

// Permit 구매 스키마
const buyPermitSchema = z.object({
  permitId: z.number().int().positive(),
});

// Permit 교환 스키마
const redeemPermitSchema = z.object({
  permitId: z.number().int().positive(),
  nonce: z.string().min(1),
});

// Cap을 이용한 배치 발행 스키마
const mintWithCapSchema = z.object({
  capId: z.number().int().positive(),
  recipientId: z.number().int().positive(),
  count: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

/**
 * @openapi
 * /permit/list:
 *   post:
 *     tags:
 *       - Permit 관리
 *     summary: Permit 상장
 *     description: |
 *       공급자가 발행 권한을 Permit으로 상장합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - scope
 *               - limit
 *               - faceValue
 *               - price
 *               - expiry
 *             properties:
 *               title:
 *                 type: string
 *                 description: 상품 제목
 *                 example: "스타벅스 아메리카노 쿠폰"
 *               description:
 *                 type: string
 *                 description: 상품 설명
 *                 example: "스타벅스 아메리카노 1잔 무료"
 *               imageUrl:
 *                 type: string
 *                 description: 상품 이미지 URL
 *                 example: "https://example.com/image.jpg"
 *               scope:
 *                 type: string
 *                 description: 권한 범위
 *                 example: "COUPON_ISSUANCE"
 *               limit:
 *                 type: string
 *                 description: 최대 발행 수량
 *                 example: "1000"
 *               faceValue:
 *                 type: string
 *                 description: 오브젝트 1개당 발행 당시 가격 (포인트)
 *                 example: "1000"
 *               price:
 *                 type: string
 *                 description: Permit 구매 가격 (포인트)
 *                 example: "10000"
 *               expiry:
 *                 type: string
 *                 format: date-time
 *                 description: Permit 만료일
 *                 example: "2024-12-31T23:59:59Z"
 *     responses:
 *       200:
 *         description: Permit 상장 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 permitId:
 *                   type: number
 *                 permit:
 *                   type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.post(
  "/list",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = listPermitSchema.parse(req.body);
      const permitRepo = AppDataSource.getRepository(SupplierPermit);
      const userRepo = AppDataSource.getRepository(User);

      // 총 가치 계산
      const totalValue = (
        BigInt(body.limit) * BigInt(body.faceValue)
      ).toString();

      // Permit 생성
      const permit = permitRepo.create({
        supplierAddress: req.userAddress!,
        title: body.title,
        description: body.description || null,
        imageUrl: body.imageUrl || null,
        scope: body.scope,
        limit: body.limit,
        faceValue: body.faceValue,
        totalValue,
        price: body.price,
        expiry: new Date(body.expiry),
        status: PermitStatus.LISTED,
        nonce: uuidv4(),
      });

      await permitRepo.save(permit);

      res.json({
        message: "Permit listed successfully",
        permitId: permit.id,
        permit: {
          id: permit.id,
          title: permit.title,
          description: permit.description,
          imageUrl: permit.imageUrl,
          scope: permit.scope,
          limit: permit.limit,
          faceValue: permit.faceValue,
          totalValue: permit.totalValue,
          price: permit.price,
          expiry: permit.expiry,
          status: permit.status,
          supplierAddress: permit.supplierAddress,
        },
      });
    } catch (err: any) {
      console.error("Permit listing error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /permit/buy:
 *   post:
 *     tags:
 *       - Permit 관리
 *     summary: Permit 구매
 *     description: |
 *       발행자가 Permit을 구매합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permitId
 *             properties:
 *               permitId:
 *                 type: number
 *                 description: 구매할 Permit ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Permit 구매 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 permitId:
 *                   type: number
 *                 newBalance:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.post(
  "/buy",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const body = buyPermitSchema.parse(req.body);
      const permitRepo = queryRunner.manager.getRepository(SupplierPermit);
      const pointRepo = queryRunner.manager.getRepository(Point);
      const userRepo = queryRunner.manager.getRepository(User);

      // Permit 조회
      const permit = await permitRepo.findOne({
        where: { id: body.permitId, status: PermitStatus.LISTED },
      });

      if (!permit) {
        return res
          .status(400)
          .json({ error: "Permit not found or not available" });
      }

      // 자신의 Permit 구매 방지
      if (permit.supplierAddress === req.userAddress) {
        return res.status(400).json({ error: "Cannot buy your own permit" });
      }

      // 만료 확인
      if (new Date() > permit.expiry) {
        await permitRepo.update(
          { id: permit.id },
          { status: PermitStatus.EXPIRED }
        );
        return res.status(400).json({ error: "Permit has expired" });
      }

      // 구매자 포인트 확인
      const buyerPoints = await pointRepo.findOne({
        where: { userAddress: req.userAddress! },
      });

      if (!buyerPoints || BigInt(buyerPoints.balance) < BigInt(permit.price)) {
        return res.status(400).json({ error: "Insufficient points" });
      }

      // 구매자 포인트 차감
      await queryRunner.manager.update(
        Point,
        { userAddress: req.userAddress! },
        {
          balance: (
            BigInt(buyerPoints.balance) - BigInt(permit.price)
          ).toString(),
        }
      );

      // 공급자 포인트 증가
      const supplierPoints = await pointRepo.findOne({
        where: { userAddress: permit.supplierAddress },
      });

      if (supplierPoints) {
        await queryRunner.manager.update(
          Point,
          { userAddress: permit.supplierAddress },
          {
            balance: (
              BigInt(supplierPoints.balance) + BigInt(permit.price)
            ).toString(),
          }
        );
      } else {
        await queryRunner.manager.save(Point, {
          userAddress: permit.supplierAddress,
          balance: permit.price,
          totalEarned: permit.price,
          totalSpent: "0",
        });
      }

      // Permit 상태 업데이트
      await queryRunner.manager.update(
        SupplierPermit,
        { id: permit.id },
        {
          status: PermitStatus.SOLD,
          buyerAddress: req.userAddress!,
          soldAt: new Date(),
        }
      );

      await queryRunner.commitTransaction();

      res.json({
        message: "Permit purchased successfully",
        permitId: permit.id,
        newBalance: (
          BigInt(buyerPoints.balance) - BigInt(permit.price)
        ).toString(),
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error("Permit purchase error:", error);
      res.status(400).json({ error: "Failed to purchase permit" });
    } finally {
      await queryRunner.release();
    }
  }
);

/**
 * @openapi
 * /permit/redeem:
 *   post:
 *     tags:
 *       - Permit 관리
 *     summary: Permit 교환 → Cap 발급
 *     description: |
 *       발행자가 Permit을 Cap으로 교환합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permitId
 *               - nonce
 *             properties:
 *               permitId:
 *                 type: number
 *                 description: 교환할 Permit ID
 *                 example: 1
 *               nonce:
 *                 type: string
 *                 description: 중복 방지 nonce
 *                 example: "unique-nonce-123"
 *     responses:
 *       200:
 *         description: Permit 교환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 capId:
 *                   type: number
 *                 cap:
 *                   type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.post(
  "/redeem",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const body = redeemPermitSchema.parse(req.body);
      const permitRepo = queryRunner.manager.getRepository(SupplierPermit);
      const capRepo = queryRunner.manager.getRepository(SupplierCap);
      const userRepo = queryRunner.manager.getRepository(User);

      // Permit 조회
      const permit = await permitRepo.findOne({
        where: {
          id: body.permitId,
          status: PermitStatus.SOLD,
          buyerAddress: req.userAddress!,
        },
      });

      if (!permit) {
        return res
          .status(400)
          .json({ error: "Permit not found or not owned by you" });
      }

      // 만료 확인
      if (new Date() > permit.expiry) {
        await permitRepo.update(
          { id: permit.id },
          { status: PermitStatus.EXPIRED }
        );
        return res.status(400).json({ error: "Permit has expired" });
      }

      // Nonce 중복 검증
      if (permit.nonce && permit.nonce === body.nonce) {
        return res.status(400).json({ error: "Nonce already used" });
      }

      // JTI 중복 검증 (DB에서 확인)
      const existingCap = await capRepo.findOne({
        where: { permitId: permit.id },
      });
      if (existingCap) {
        return res.status(400).json({ error: "Permit already redeemed" });
      }

      // Cap 생성
      const cap = capRepo.create({
        permitId: permit.id,
        ownerAddress: req.userAddress!,
        supplierAddress: permit.supplierAddress,
        scope: permit.scope,
        remaining: permit.limit,
        originalLimit: permit.limit,
        faceValue: permit.faceValue,
        title: permit.title,
        description: permit.description,
        imageUrl: permit.imageUrl,
        expiry: permit.expiry,
        status: CapStatus.ACTIVE,
        frozen: false,
      });

      await capRepo.save(cap);

      // Permit 상태 업데이트
      await queryRunner.manager.update(
        SupplierPermit,
        { id: permit.id },
        {
          status: PermitStatus.REDEEMED,
          nonce: body.nonce,
          redeemedAt: new Date(),
        }
      );

      await queryRunner.commitTransaction();

      res.json({
        message: "Permit redeemed successfully",
        capId: cap.id,
        cap: {
          id: cap.id,
          scope: cap.scope,
          remaining: cap.remaining,
          originalLimit: cap.originalLimit,
          faceValue: cap.faceValue,
          title: cap.title,
          description: cap.description,
          imageUrl: cap.imageUrl,
          expiry: cap.expiry,
          status: cap.status,
          frozen: cap.frozen,
        },
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error("Permit redeem error:", error);
      res.status(400).json({ error: "Failed to redeem permit" });
    } finally {
      await queryRunner.release();
    }
  }
);

/**
 * @openapi
 * /permit/mint-with-cap:
 *   post:
 *     tags:
 *       - Permit 관리
 *     summary: Cap을 이용한 배치 발행
 *     description: |
 *       Cap을 사용하여 쿠폰 오브젝트를 배치 발행합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - capId
 *               - count
 *               - idempotencyKey
 *             properties:
 *               capId:
 *                 type: number
 *                 description: 사용할 Cap ID
 *                 example: 1
 *               recipientId:
 *                 type: number
 *                 description: 수령자 사용자 ID
 *                 example: 2
 *               count:
 *                 type: number
 *                 description: 발행할 수량
 *                 example: 5
 *               idempotencyKey:
 *                 type: string
 *                 description: 중복 방지 키
 *                 example: "unique-key-123"
 *     responses:
 *       200:
 *         description: 배치 발행 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 capId:
 *                   type: number
 *                 issuedCount:
 *                   type: number
 *                 remaining:
 *                   type: string
 *                 objects:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.post(
  "/mint-with-cap",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const body = mintWithCapSchema.parse(req.body);
      const capRepo = queryRunner.manager.getRepository(SupplierCap);
      const objectRepo = queryRunner.manager.getRepository(CouponObject);
      const pointRepo = queryRunner.manager.getRepository(Point);
      const escrowRepo = queryRunner.manager.getRepository(EscrowAccount);
      const userRepo = queryRunner.manager.getRepository(User);

      // Cap 조회
      const cap = await capRepo.findOne({
        where: {
          id: body.capId,
          ownerAddress: req.userAddress!,
          status: CapStatus.ACTIVE,
        },
      });

      if (!cap) {
        return res
          .status(400)
          .json({ error: "Cap not found or not owned by you" });
      }

      // Cap 상태 확인
      if (cap.frozen) {
        return res.status(400).json({ error: "Cap is frozen" });
      }

      if (new Date() > cap.expiry) {
        await capRepo.update({ id: cap.id }, { status: CapStatus.EXPIRED });
        return res.status(400).json({ error: "Cap has expired" });
      }

      if (BigInt(cap.remaining) < BigInt(body.count)) {
        return res.status(400).json({ error: "Insufficient remaining limit" });
      }

      // 수령자 확인 (ID로 조회)
      const recipient = await userRepo.findOne({
        where: { id: body.recipientId },
      });

      if (!recipient) {
        return res.status(400).json({ error: "Recipient not found" });
      }

      // 공급자와 발행자 정보 조회
      const supplier = await userRepo.findOne({
        where: { address: cap.supplierAddress },
      });
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }

      const issuer = await userRepo.findOne({
        where: { address: req.userAddress! },
      });
      if (!issuer) {
        return res.status(400).json({ error: "Issuer not found" });
      }

      // 발행자 포인트 확인 (트랜잭션 내에서 다시 확인)
      const issuerPoints = await queryRunner.manager.findOne(Point, {
        where: { userAddress: req.userAddress },
        lock: { mode: "pessimistic_write" }, // 비관적 락으로 동시성 문제 방지
      });

      const totalCost = BigInt(cap.faceValue) * BigInt(body.count);
      if (!issuerPoints || BigInt(issuerPoints.balance) < totalCost) {
        return res.status(400).json({ error: "Insufficient points" });
      }

      // 발행자 포인트 차감 (원자적 업데이트)
      const updateResult = await queryRunner.manager.update(
        Point,
        {
          userAddress: req.userAddress!,
          balance: issuerPoints.balance, // 현재 잔액과 일치하는 경우에만 업데이트
        },
        {
          balance: (BigInt(issuerPoints.balance) - totalCost).toString(),
        }
      );

      // 업데이트가 실패한 경우 (동시성 문제)
      if (updateResult.affected === 0) {
        return res
          .status(400)
          .json({ error: "Point balance changed, please try again" });
      }

      // Escrow 계정에 포인트 예치
      let escrowAccount = await escrowRepo.findOne({
        where: { supplierAddress: cap.supplierAddress },
      });

      if (!escrowAccount) {
        escrowAccount = escrowRepo.create({
          supplierAddress: cap.supplierAddress,
          balance: "0",
        });
        await escrowRepo.save(escrowAccount);
      }

      const newEscrowBalance = BigInt(escrowAccount.balance) + totalCost;
      await queryRunner.manager.update(
        EscrowAccount,
        { id: escrowAccount.id },
        {
          balance: newEscrowBalance.toString(),
        }
      );

      // 공급자에게 3% 수수료 지급
      const supplierFee = (totalCost * BigInt(3)) / BigInt(100);
      const supplierPoints = await pointRepo.findOne({
        where: { userAddress: cap.supplierAddress },
      });

      if (supplierPoints) {
        await queryRunner.manager.update(
          Point,
          { userAddress: cap.supplierAddress },
          {
            balance: (BigInt(supplierPoints.balance) + supplierFee).toString(),
          }
        );
      } else {
        await queryRunner.manager.save(Point, {
          userAddress: cap.supplierAddress,
          balance: supplierFee.toString(),
          totalEarned: supplierFee.toString(),
          totalSpent: "0",
        });
      }

      // 쿠폰 오브젝트들 배치 생성
      const objects = [];
      const couponObjects = [];
      const now = new Date();
      const remaining = (BigInt(cap.faceValue) - supplierFee).toString();

      for (let i = 0; i < body.count; i++) {
        const objectId = `COUPON_${uuidv4()
          .replace(/-/g, "")
          .substring(0, 16)
          .toUpperCase()}`;

        const couponObject = objectRepo.create({
          objectId,
          ownerId: recipient.id,
          ownerAddress: recipient.address,
          stampId: null, // Permit 기반 발행에서는 IssuanceStamp를 사용하지 않음
          supplierId: supplier.id,
          supplierAddress: supplier.address,
          issuerId: issuer.id,
          issuerAddress: issuer.address,
          title: cap.title,
          description: cap.description,
          imageUrl: cap.imageUrl,
          faceValue: cap.faceValue,
          remaining,
          tradeCount: 0,
          state: CouponObjectState.CREATED,
          expiresAt: cap.expiry,
          issuedAt: now,
        });

        couponObjects.push(couponObject);
      }

      // 배치 삽입으로 성능 최적화
      const savedObjects = await queryRunner.manager.save(
        CouponObject,
        couponObjects
      );

      // 응답용 객체 생성
      objects.push(
        ...savedObjects.map((obj) => ({
          id: obj.id,
          objectId: obj.objectId,
          title: obj.title,
          faceValue: obj.faceValue,
          remaining: obj.remaining,
          state: obj.state,
        }))
      );

      // Cap 업데이트
      const newRemaining = BigInt(cap.remaining) - BigInt(body.count);
      const newIssuedCount = cap.issuedCount + body.count;
      const newTotalValueIssued = BigInt(cap.totalValueIssued) + totalCost;

      await queryRunner.manager.update(
        SupplierCap,
        { id: cap.id },
        {
          remaining: newRemaining.toString(),
          issuedCount: newIssuedCount,
          totalValueIssued: newTotalValueIssued.toString(),
          status:
            newRemaining === BigInt(0) ? CapStatus.EXHAUSTED : CapStatus.ACTIVE,
        }
      );

      await queryRunner.commitTransaction();

      res.json({
        message: "Batch minting successful",
        capId: cap.id,
        issuedCount: body.count,
        remaining: newRemaining.toString(),
        objects,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error("Batch minting error:", error);
      res.status(400).json({
        error: "Failed to mint with cap",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      await queryRunner.release();
    }
  }
);

/**
 * @openapi
 * /permit/freeze-cap:
 *   post:
 *     tags:
 *       - Permit 관리
 *     summary: Cap 정지
 *     description: |
 *       공급자나 관리자가 Cap을 정지합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - capId
 *             properties:
 *               capId:
 *                 type: number
 *                 description: 정지할 Cap ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Cap 정지 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 capId:
 *                   type: number
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.post(
  "/freeze-cap",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = z
        .object({ capId: z.number().int().positive() })
        .parse(req.body);
      const capRepo = AppDataSource.getRepository(SupplierCap);

      // Cap 조회
      const cap = await capRepo.findOne({
        where: { id: body.capId },
      });

      if (!cap) {
        return res.status(400).json({ error: "Cap not found" });
      }

      // 권한 확인 (공급자 또는 소유자 또는 관리자)
      const isSupplier = cap.supplierAddress === req.userAddress!;
      const isOwner = cap.ownerAddress === req.userAddress!;
      const isAdmin = req.userId === 1; // 관리자 ID (실제로는 더 정교한 권한 관리 필요)

      if (!isSupplier && !isOwner && !isAdmin) {
        return res
          .status(403)
          .json({ error: "Not authorized to freeze this cap" });
      }

      // Cap 정지
      await capRepo.update(
        { id: cap.id },
        {
          frozen: true,
          status: CapStatus.FROZEN,
        }
      );

      res.json({
        message: "Cap frozen successfully",
        capId: cap.id,
      });
    } catch (err: any) {
      console.error("Cap freeze error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /permit/list-permits:
 *   get:
 *     tags:
 *       - Permit 관리
 *     summary: Permit 목록 조회
 *     description: |
 *       상장된 Permit 목록을 조회합니다
 *
 *       **ℹ️ 공개 API**
 *       - 이 API는 인증 없이도 접근 가능합니다
 *       - 모든 사용자가 상장된 Permit 목록을 조회할 수 있습니다
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [LISTED, SOLD, REDEEMED, EXPIRED, CANCELLED]
 *         description: Permit 상태 필터
 *       - in: query
 *         name: supplierAddress
 *         schema:
 *           type: string
 *         description: 공급자 지갑 주소 필터
 *     responses:
 *       200:
 *         description: Permit 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permits:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 요청
 */
permitRouter.get("/list-permits", async (req, res) => {
  try {
    const permitRepo = AppDataSource.getRepository(SupplierPermit);
    const { status, supplierAddress } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (supplierAddress) where.supplierAddress = supplierAddress as string;

    const permits = await permitRepo.find({
      where,
      order: { id: "DESC" },
    });

    const permitsList = permits.map((permit) => ({
      id: permit.id,
      title: permit.title,
      description: permit.description,
      imageUrl: permit.imageUrl,
      scope: permit.scope,
      limit: permit.limit,
      faceValue: permit.faceValue,
      totalValue: permit.totalValue,
      price: permit.price,
      expiry: permit.expiry,
      status: permit.status,
      supplierAddress: permit.supplierAddress,
      buyerAddress: permit.buyerAddress,
      soldAt: permit.soldAt,
      redeemedAt: permit.redeemedAt,
    }));

    res.json({ permits: permitsList });
  } catch (err: any) {
    console.error("List permits error:", err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * @openapi
 * /permit/my-caps:
 *   get:
 *     tags:
 *       - Permit 관리
 *     summary: 내 Cap 목록 조회
 *     description: |
 *       사용자가 소유한 Cap 목록과 발행된 쿠폰 오브젝트를 조회합니다
 *
 *       **ℹ️ 모든 사용자 접근 가능**
 *       - Business 계정: 자신이 소유한 Cap 목록 조회
 *       - Consumer 계정: 자신이 발행받은 쿠폰 오브젝트 목록 조회
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Cap 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 caps:
 *                   type: array
 *                   items:
 *                     type: object
 *                 couponObjects:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 인증 오류
 */
permitRouter.get(
  "/my-caps",
  requireUserWithRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const capRepo = AppDataSource.getRepository(SupplierCap);
      const couponObjectRepo = AppDataSource.getRepository(CouponObject);
      const userRepo = AppDataSource.getRepository(User);

      // 사용자 정보 조회
      const user = await userRepo.findOne({
        where: { address: req.userAddress! },
      });

      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      let capsList: Array<{
        id: number;
        scope: string;
        remaining: string;
        originalLimit: string;
        faceValue: string;
        title: string;
        description: string | null;
        imageUrl: string | null;
        expiry: Date;
        status: string;
        frozen: boolean;
        issuedCount: number;
        totalValueIssued: string;
        supplierAddress: string;
        permit: { id: number; price: string } | null;
      }> = [];

      let couponObjectsList: Array<{
        id: number;
        objectId: string | null;
        title: string;
        description: string | null;
        imageUrl: string | null;
        faceValue: string;
        remaining: string;
        tradeCount: number;
        state: string;
        expiresAt: Date;
        issuedAt: Date;
        usedAt: Date | null;
        supplierId: number;
        issuerId: number;
      }> = [];

      if (req.userRole === "BUSINESS") {
        // Business 계정: 자신이 소유한 Cap 목록 조회
        const caps = await capRepo.find({
          where: { ownerAddress: req.userAddress! },
          relations: ["permit"],
          order: { id: "DESC" },
        });

        capsList = caps.map((cap) => ({
          id: cap.id,
          scope: cap.scope,
          remaining: cap.remaining,
          originalLimit: cap.originalLimit,
          faceValue: cap.faceValue,
          title: cap.title,
          description: cap.description,
          imageUrl: cap.imageUrl,
          expiry: cap.expiry,
          status: cap.status,
          frozen: cap.frozen,
          issuedCount: cap.issuedCount,
          totalValueIssued: cap.totalValueIssued,
          supplierAddress: cap.supplierAddress,
          permit: cap.permit
            ? {
                id: cap.permit.id,
                price: cap.permit.price,
              }
            : null,
        }));
      }

      // 모든 사용자: 자신이 발행받은 쿠폰 오브젝트 목록 조회
      const couponObjects = await couponObjectRepo.find({
        where: { ownerId: user.id },
        order: { id: "DESC" },
      });

      couponObjectsList = couponObjects.map((obj) => ({
        id: obj.id,
        objectId: obj.objectId,
        title: obj.title,
        description: obj.description,
        imageUrl: obj.imageUrl,
        faceValue: obj.faceValue,
        remaining: obj.remaining,
        tradeCount: obj.tradeCount,
        state: obj.state,
        expiresAt: obj.expiresAt,
        issuedAt: obj.issuedAt,
        usedAt: obj.usedAt,
        supplierId: obj.supplierId,
        issuerId: obj.issuerId,
      }));

      res.json({
        caps: capsList,
        couponObjects: couponObjectsList,
      });
    } catch (err: any) {
      console.error("List my caps error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);
/**
 * @openapi
 * /permit/my-permits:
 *   get:
 *     tags:
 *       - Permit 관리
 *     summary: 내 Permit 목록 조회
 *     description: |
 *       사용자가 소유한 Permit 목록을 조회합니다
 *
 *       **⚠️ Business 계정 전용 API**
 *       - 이 API는 Business 계정으로 전환된 사용자만 사용할 수 있습니다
 *       - Consumer 계정으로는 접근이 제한됩니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Permit 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       imageUrl:
 *                         type: string
 *                       scope:
 *                         type: string
 *                       limit:
 *                         type: string
 *                       faceValue:
 *                         type: string
 *                       totalValue:
 *                         type: string
 *                       price:
 *                         type: string
 *                       expiry:
 *                         type: string
 *                       status:
 *                         type: string
 *                       supplierAddress:
 *                         type: string
 *                       buyerAddress:
 *                         type: string
 *                       soldAt:
 *                         type: string
 *                       redeemedAt:
 *                         type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: Business 계정이 아님 (Consumer 계정으로는 접근 불가)
 */
permitRouter.get(
  "/my-permits",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    try {
      const permitRepo = AppDataSource.getRepository(SupplierPermit);

      // 내가 올린 Permit 조회
      const createdPermits = await permitRepo.find({
        where: { supplierAddress: req.userAddress! },
        order: { id: "DESC" },
      });

      // 내가 산 Permit 조회
      const purchasedPermits = await permitRepo.find({
        where: { buyerAddress: req.userAddress! },
        order: { id: "DESC" },
      });

      // 응답 데이터 포맷팅
      const formatPermit = (permit: any, type: string) => ({
        id: permit.id,
        title: permit.title,
        description: permit.description,
        imageUrl: permit.imageUrl,
        scope: permit.scope,
        limit: permit.limit,
        faceValue: permit.faceValue,
        totalValue: permit.totalValue,
        price: permit.price,
        expiry: permit.expiry,
        status: permit.status,
        supplierAddress: permit.supplierAddress,
        buyerAddress: permit.buyerAddress,
        soldAt: permit.soldAt,
        redeemedAt: permit.redeemedAt,
        type, // "올린" 또는 "산"
      });

      res.json({
        내가올린: createdPermits.map((permit) => formatPermit(permit, "올린")),
        내가산: purchasedPermits.map((permit) => formatPermit(permit, "산")),
        요약: {
          총올린수: createdPermits.length,
          총산수: purchasedPermits.length,
          전체: createdPermits.length + purchasedPermits.length,
        },
      });
    } catch (err: any) {
      console.error("List my permits error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);
