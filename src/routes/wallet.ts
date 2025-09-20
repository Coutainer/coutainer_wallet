import { Router } from "express";
import { createSuiClient } from "../sui/client";
import { generateWallet, getSuiBalance } from "../sui/wallet";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { CouponObject } from "../entities/CouponObject";
import { suiWalletManager } from "../sui/wallet-manager";
import { suiObjectManager } from "../sui/object-manager";
import { suiSyncService } from "../sui/sync-service";

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

      // 데이터베이스에서 오브젝트 조회
      const cryptoObjects = await couponObjectRepo.find({
        where: { ownerId: user.id },
        order: { id: "DESC" },
      });

      // Sui 블록체인에서도 오브젝트 조회하여 동기화
      try {
        const suiObjects = await suiObjectManager.getUserCouponObjects(
          req.userAddress!
        );
        console.log(`🔗 Sui에서 ${suiObjects.length}개의 오브젝트 발견`);
      } catch (error: any) {
        console.warn("Sui 오브젝트 조회 실패:", error.message);
      }

      res.json(cryptoObjects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /wallet/sync:
 *   post:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: 지갑 동기화
 *     description: 사용자의 지갑을 Sui 블록체인과 동기화합니다
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
 *                 syncedBalances:
 *                   type: number
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: 서버 오류
 */
walletRouter.post(
  "/sync",
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
      console.error("지갑 동기화 오류:", err);
      res.status(500).json({
        error: err.message,
        success: false,
      });
    }
  }
);

/**
 * @openapi
 * /wallet/sui-objects:
 *   get:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: Sui 블록체인 오브젝트 조회
 *     description: 사용자의 Sui 블록체인에 있는 모든 오브젝트를 조회합니다
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
 *         description: 오브젝트 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 objects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       content:
 *                         type: object
 *                 total:
 *                   type: number
 *       500:
 *         description: 서버 오류
 */
walletRouter.get(
  "/sui-objects",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const objects = await suiWalletManager.getUserObjects(req.userAddress!);

      res.json({
        objects: objects.map((obj) => ({
          id: obj.data?.objectId,
          type: obj.data?.type,
          content: obj.data?.content,
        })),
        total: objects.length,
      });
    } catch (err: any) {
      console.error("Sui 오브젝트 조회 오류:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /wallet/network-status:
 *   get:
 *     tags:
 *       - 1️⃣ 지갑
 *     summary: 네트워크 상태 조회
 *     description: Sui 네트워크 연결 상태를 조회합니다
 *     responses:
 *       200:
 *         description: 네트워크 상태 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                 chainId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 epoch:
 *                   type: number
 *       500:
 *         description: 서버 오류
 */
walletRouter.get("/network-status", async (req, res) => {
  try {
    const status = await suiSyncService.checkNetworkStatus();
    res.json(status);
  } catch (err: any) {
    console.error("네트워크 상태 조회 오류:", err);
    res.status(500).json({ error: err.message });
  }
});
