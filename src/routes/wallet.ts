import { Router } from "express";
import { createSuiClient } from "../sui/client";
import { generateWallet, getSuiBalance } from "../sui/wallet";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject } from "../entities/CouponObject";

export const walletRouter = Router();
const client = createSuiClient();

/**
 * @openapi
 * /wallet/my-crypto-objects:
 *   get:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: 내 암호화된 오브젝트 목록 조회
 *     description: 사용자가 보유한 암호화된 오브젝트(cryptoObject) 목록을 조회합니다 (토큰에서 자동으로 주소 추출)
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
 *         description: 암호화된 오브젝트 목록 조회 성공
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
 *                   type:
 *                     type: string
 *                   value:
 *                     type: string
 *                   expiryTimeMs:
 *                     type: string
 *                   used:
 *                     type: boolean
 *       500:
 *         description: 서버 오류
 */
/**
 * @openapi
 * /wallet/balance:
 *   get:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: SUI 잔액 조회
 *     description: 사용자의 지갑 SUI 잔액을 조회합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *     responses:
 *       200:
 *         description: SUI 잔액 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                 balance:
 *                   type: string
 *       500:
 *         description: 서버 오류
 */
walletRouter.get(
  "/balance",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const balance = await getSuiBalance(client, req.userAddress!);

      res.json({
        address: req.userAddress,
        balance: balance.toString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /wallet/info:
 *   get:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: 지갑 정보 조회
 *     description: 사용자의 지갑 정보를 조회합니다
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *     responses:
 *       200:
 *         description: 지갑 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                 zkLoginAddress:
 *                   type: string
 *                 hasWallet:
 *                   type: boolean
 *       500:
 *         description: 서버 오류
 */
walletRouter.get(
  "/info",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        address: user.address,
        zkLoginAddress: user.zkLoginAddress,
        hasWallet: user.hasWallet,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

walletRouter.get(
  "/my-crypto-objects",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const couponObjectRepo = AppDataSource.getRepository(CouponObject);
      const userRepo = AppDataSource.getRepository(User);

      // 사용자 ID로 CouponObject 조회
      const user = await userRepo.findOne({
        where: { address: req.userAddress },
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const cryptoObjects = await couponObjectRepo.find({
        where: { ownerId: user.id },
        order: { id: "DESC" },
      });

      res.json(cryptoObjects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
