import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { Coupon } from "../entities/Coupon";
import { CouponSale } from "../entities/CouponSale";
import { Point } from "../entities/Point";
import { User } from "../entities/User";
import {
  requireUser,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/auth";
import { createSuiClient } from "../sui/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";

export const couponRouter = Router();
const client = createSuiClient();

const createCryptoObjectSchema = z.object({
  couponType: z.string(),
  value: z.string(), // MIST amount
  expiryDays: z.number(),
  encryptedData: z.string(),
});

const listCryptoObjectForSaleSchema = z.object({
  cryptoObjectId: z.string(),
  priceMist: z.string(),
});

const buyCryptoObjectSchema = z.object({
  saleId: z.number(),
});

const decodeCryptoObjectSchema = z.object({
  cryptoObjectId: z.string(),
});

const buyWithPointsSchema = z.object({
  saleId: z.number(),
});

/**
 * @openapi
 * /coupon/create-crypto-object:
 *   post:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 암호화된 오브젝트 생성 (공급자 전용)
 *     description: 공급자가 암호화된 쿠폰 오브젝트(cryptoObject)를 생성합니다 (공급자 권한 필요)
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
 *               - couponType
 *               - value
 *               - expiryDays
 *               - encryptedData
 *             properties:
 *               couponType:
 *                 type: string
 *                 description: 쿠폰 타입
 *                 example: "coffee"
 *               value:
 *                 type: string
 *                 description: 쿠폰 가치 (MIST 단위)
 *                 example: "1000000000"
 *               expiryDays:
 *                 type: number
 *                 description: 만료일 (일 단위)
 *                 example: 30
 *               encryptedData:
 *                 type: string
 *                 description: 암호화된 쿠폰 데이터
 *                 example: "encrypted_coupon_data"
 *     responses:
 *       200:
 *         description: 암호화된 오브젝트 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cryptoObjectId:
 *                   type: string
 *                   description: Sui 암호화된 오브젝트 ID
 *                 transactionDigest:
 *                   type: string
 *                   description: 트랜잭션 해시
 *                 cryptoObject:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     type:
 *                       type: string
 *                     value:
 *                       type: string
 *                     expiryTimeMs:
 *                       type: string
 *       400:
 *         description: 잘못된 요청 또는 트랜잭션 실패
 */
couponRouter.post(
  "/create-crypto-object",
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = createCryptoObjectSchema.parse(req.body);

      // JWT에서 사용자 정보 가져오기
      const userId = req.userId!;
      const userAddress = req.userAddress!;

      // 사용자 정보에서 니모닉 가져오기
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user || !user.mnemonic) {
        return res
          .status(400)
          .json({ error: "User wallet not found or mnemonic not available" });
      }

      const keypair = Ed25519Keypair.deriveKeypair(user.mnemonic);

      // Create transaction to issue coupon
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${process.env.COUPON_PACKAGE_ID}::coupon::issue_coupon`,
        arguments: [
          tx.pure(body.couponType),
          tx.pure(body.value),
          tx.pure(body.expiryDays),
          tx.pure(body.encryptedData),
        ],
      });

      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      // Extract object ID from transaction result
      const created = result.objectChanges?.find(
        (change: any) =>
          change.type === "created" &&
          change.objectType &&
          String(change.objectType).includes("CouponObject")
      ) as any | undefined;
      const objectId = created?.objectId as string | undefined;

      if (!objectId) {
        return res.status(500).json({ error: "Failed to extract object ID" });
      }

      // Save to database
      const couponRepo = AppDataSource.getRepository(Coupon);
      const coupon = couponRepo.create({
        objectId,
        type: body.couponType,
        value: body.value,
        expiryTimeMs: (
          Date.now() +
          body.expiryDays * 24 * 60 * 60 * 1000
        ).toString(),
        used: false,
        ownerAddress: req.userAddress!,
      });

      await couponRepo.save(coupon);

      res.json({
        cryptoObjectId: objectId,
        transactionDigest: result.digest,
        cryptoObject: {
          id: coupon.id,
          type: coupon.type,
          value: coupon.value,
          expiryTimeMs: coupon.expiryTimeMs,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /coupon/list-crypto-object-for-sale:
 *   post:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 암호화된 오브젝트 판매 등록
 *     description: 사용자가 보유한 암호화된 오브젝트(cryptoObject)를 판매 목록에 등록합니다 (토큰에서 자동으로 주소 추출)
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
 *               - cryptoObjectId
 *               - priceMist
 *             properties:
 *               cryptoObjectId:
 *                 type: string
 *                 description: 암호화된 오브젝트 ID
 *               priceMist:
 *                 type: string
 *                 description: 판매 가격 (MIST 단위)
 *                 example: "1000000000"
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
 *                 saleId:
 *                   type: number
 *       400:
 *         description: 잘못된 요청 또는 권한 없음
 */
couponRouter.post(
  "/list-crypto-object-for-sale",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = listCryptoObjectForSaleSchema.parse(req.body);
      const couponRepo = AppDataSource.getRepository(Coupon);
      const saleRepo = AppDataSource.getRepository(CouponSale);

      // Verify crypto object ownership
      const coupon = await couponRepo.findOne({
        where: { objectId: body.cryptoObjectId, ownerAddress: req.userAddress },
      });

      if (!coupon) {
        return res
          .status(404)
          .json({ error: "Crypto object not found or not owned" });
      }

      if (coupon.used) {
        return res.status(400).json({ error: "Crypto object already used" });
      }

      // Check if already listed
      const existingSale = await saleRepo.findOne({
        where: { couponObjectId: body.cryptoObjectId, active: true },
      });

      if (existingSale) {
        return res
          .status(400)
          .json({ error: "Crypto object already listed for sale" });
      }

      // Create sale listing
      const sale = saleRepo.create({
        couponObjectId: body.cryptoObjectId,
        sellerAddress: req.userAddress!,
        priceMist: body.priceMist,
        active: true,
      });

      await saleRepo.save(sale);

      res.json({ message: "Crypto object listed for sale", saleId: sale.id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /coupon/buy-crypto-object:
 *   post:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 암호화된 오브젝트 구매
 *     description: 사용자가 SUI를 사용하여 암호화된 오브젝트(cryptoObject)를 구매합니다 (누구나 구매 가능, 토큰에서 자동으로 주소 추출)
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
 *               - saleId
 *             properties:
 *               saleId:
 *                 type: number
 *                 description: 판매 ID
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
 *                 cryptoObjectId:
 *                   type: string
 *                 transactionDigest:
 *                   type: string
 *       400:
 *         description: 잘못된 요청 또는 구매 실패
 */
couponRouter.post(
  "/buy-crypto-object",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = buyCryptoObjectSchema.parse(req.body);

      // JWT에서 사용자 정보 가져오기
      const userId = req.userId!;
      const userAddress = req.userAddress!;

      // 사용자 정보에서 니모닉 가져오기
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user || !user.mnemonic) {
        return res
          .status(400)
          .json({ error: "User wallet not found or mnemonic not available" });
      }

      const keypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
      const saleRepo = AppDataSource.getRepository(CouponSale);
      const couponRepo = AppDataSource.getRepository(Coupon);

      // Get sale info
      const sale = await saleRepo.findOne({
        where: { id: body.saleId, active: true },
      });

      if (!sale) {
        return res.status(404).json({ error: "Sale not found or inactive" });
      }

      // Get coupon info
      const coupon = await couponRepo.findOne({
        where: { objectId: sale.couponObjectId },
      });

      if (!coupon) {
        return res.status(404).json({ error: "Crypto object not found" });
      }

      // Verify that the buyer is not the seller
      if (sale.sellerAddress === req.userAddress) {
        return res
          .status(400)
          .json({ error: "Cannot buy your own crypto object" });
      }

      // Create transaction to buy coupon
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${process.env.COUPON_PACKAGE_ID}::coupon::buy_coupon`,
        arguments: [tx.pure(sale.couponObjectId), tx.pure(sale.priceMist)],
      });

      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      // Update sale as completed
      sale.active = false;
      await saleRepo.save(sale);

      // Update coupon owner
      coupon.ownerAddress = req.userAddress!;
      await couponRepo.save(coupon);

      res.json({
        message: "Crypto object purchased successfully",
        cryptoObjectId: sale.couponObjectId,
        transactionDigest: result.digest,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /coupon/crypto-objects-for-sale:
 *   get:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 판매 중인 암호화된 오브젝트 목록 조회
 *     description: 현재 판매 중인 암호화된 오브젝트(cryptoObject) 목록을 조회합니다 (인증 불필요)
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
 *                   couponObjectId:
 *                     type: string
 *                   sellerAddress:
 *                     type: string
 *                   priceMist:
 *                     type: string
 *                   cryptoObject:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       value:
 *                         type: string
 *                       expiryTimeMs:
 *                         type: string
 *       500:
 *         description: 서버 오류
 */
couponRouter.get("/crypto-objects-for-sale", async (req, res) => {
  try {
    const saleRepo = AppDataSource.getRepository(CouponSale);
    const couponRepo = AppDataSource.getRepository(Coupon);

    const sales = await saleRepo.find({
      where: { active: true },
      order: { id: "DESC" },
    });

    // Join with coupon details
    const salesWithDetails = await Promise.all(
      sales.map(async (sale) => {
        const coupon = await couponRepo.findOne({
          where: { objectId: sale.couponObjectId },
        });
        return {
          ...sale,
          cryptoObject: coupon,
        };
      })
    );

    res.json(salesWithDetails);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /coupon/decode-crypto-object:
 *   post:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 암호화된 오브젝트 디코딩
 *     description: 암호화된 오브젝트(cryptoObject)를 디코딩하여 실제 디지털 쿠폰을 얻습니다 (토큰에서 자동으로 주소 추출)
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
 *               - cryptoObjectId
 *             properties:
 *               cryptoObjectId:
 *                 type: string
 *                 description: 디코딩할 암호화된 오브젝트 ID
 *                 example: "0x1234567890abcdef..."
 *     responses:
 *       200:
 *         description: 암호화된 오브젝트 디코딩 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 couponCode:
 *                   type: string
 *                   description: 실제 쿠폰 코드
 *                 couponType:
 *                   type: string
 *                   description: 쿠폰 타입
 *                 value:
 *                   type: string
 *                   description: 쿠폰 가치
 *                 expiryTimeMs:
 *                   type: string
 *                   description: 만료 시간
 *       400:
 *         description: 잘못된 요청 또는 디코딩 실패
 */
couponRouter.post(
  "/decode-crypto-object",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = decodeCryptoObjectSchema.parse(req.body);

      // JWT에서 사용자 정보 가져오기
      const userId = req.userId!;
      const userAddress = req.userAddress!;

      // 사용자 정보에서 니모닉 가져오기
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user || !user.mnemonic) {
        return res
          .status(400)
          .json({ error: "User wallet not found or mnemonic not available" });
      }

      const keypair = Ed25519Keypair.deriveKeypair(user.mnemonic);
      const couponRepo = AppDataSource.getRepository(Coupon);

      // Verify crypto object ownership
      const coupon = await couponRepo.findOne({
        where: { objectId: body.cryptoObjectId, ownerAddress: req.userAddress },
      });

      if (!coupon) {
        return res
          .status(404)
          .json({ error: "Crypto object not found or not owned" });
      }

      if (coupon.used) {
        return res.status(400).json({ error: "Crypto object already used" });
      }

      // Check if expired
      const now = Date.now();
      const expiryTime = parseInt(coupon.expiryTimeMs);
      if (now > expiryTime) {
        return res.status(400).json({ error: "Crypto object has expired" });
      }

      // Create transaction to decode crypto object
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${process.env.COUPON_PACKAGE_ID}::coupon::use_coupon`,
        arguments: [tx.pure(body.cryptoObjectId)],
      });

      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true },
      });

      // Mark crypto object as used
      coupon.used = true;
      await couponRepo.save(coupon);

      // Generate actual coupon code (in real implementation, this would be from the encrypted data)
      const couponCode = `COUPON_${coupon.type.toUpperCase()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      res.json({
        couponCode,
        couponType: coupon.type,
        value: coupon.value,
        expiryTimeMs: coupon.expiryTimeMs,
        transactionDigest: result.digest,
        message: "암호화된 오브젝트가 성공적으로 디코딩되었습니다",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /coupon/buy-crypto-object-with-points:
 *   post:
 *     tags:
 *       - 2️⃣ 쿠폰
 *     summary: 포인트로 암호화된 오브젝트 구매
 *     description: 사용자가 포인트를 사용하여 암호화된 오브젝트(cryptoObject)를 구매합니다 (누구나 구매 가능, 토큰에서 자동으로 주소 추출)
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
 *               - saleId
 *             properties:
 *               saleId:
 *                 type: number
 *                 description: 판매 ID
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
 *                 cryptoObjectId:
 *                   type: string
 *                 pointsSpent:
 *                   type: string
 *       400:
 *         description: 잘못된 요청 또는 구매 실패
 */
couponRouter.post(
  "/buy-crypto-object-with-points",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = buyWithPointsSchema.parse(req.body);
      const saleRepo = AppDataSource.getRepository(CouponSale);
      const couponRepo = AppDataSource.getRepository(Coupon);
      const pointRepo = AppDataSource.getRepository(Point);

      // Get sale info
      const sale = await saleRepo.findOne({
        where: { id: body.saleId, active: true },
      });

      if (!sale) {
        return res.status(404).json({ error: "Sale not found or inactive" });
      }

      // Get coupon info
      const coupon = await couponRepo.findOne({
        where: { objectId: sale.couponObjectId },
      });

      if (!coupon) {
        return res.status(404).json({ error: "Crypto object not found" });
      }

      // Verify that the buyer is not the seller
      if (sale.sellerAddress === req.userAddress) {
        return res
          .status(400)
          .json({ error: "Cannot buy your own crypto object" });
      }

      // Get buyer's point account
      let buyerPoint = await pointRepo.findOne({
        where: { userAddress: req.userAddress },
      });

      if (!buyerPoint) {
        return res.status(404).json({ error: "Point account not found" });
      }

      // Check if buyer has enough points
      const priceInPoints = BigInt(sale.priceMist); // Assuming 1 MIST = 1 point for simplicity
      if (BigInt(buyerPoint.balance) < priceInPoints) {
        return res.status(400).json({ error: "Insufficient points" });
      }

      // Deduct points from buyer
      buyerPoint.balance = (
        BigInt(buyerPoint.balance) - priceInPoints
      ).toString();
      buyerPoint.totalSpent = (
        BigInt(buyerPoint.totalSpent) + priceInPoints
      ).toString();
      await pointRepo.save(buyerPoint);

      // Give points to seller
      let sellerPoint = await pointRepo.findOne({
        where: { userAddress: sale.sellerAddress },
      });

      if (!sellerPoint) {
        sellerPoint = pointRepo.create({
          userAddress: sale.sellerAddress,
          balance: "0",
          totalEarned: "0",
          totalSpent: "0",
        });
      }

      sellerPoint.balance = (
        BigInt(sellerPoint.balance) + priceInPoints
      ).toString();
      sellerPoint.totalEarned = (
        BigInt(sellerPoint.totalEarned) + priceInPoints
      ).toString();
      await pointRepo.save(sellerPoint);

      // Update sale as completed
      sale.active = false;
      await saleRepo.save(sale);

      // Update coupon owner
      coupon.ownerAddress = req.userAddress!;
      await couponRepo.save(coupon);

      res.json({
        message: "Crypto object purchased with points successfully",
        cryptoObjectId: sale.couponObjectId,
        pointsSpent: priceInPoints.toString(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);
