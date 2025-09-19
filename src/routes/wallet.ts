import { Router } from "express";
import { createSuiClient } from "../sui/client";
import { generateWallet } from "../sui/wallet";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { Coupon } from "../entities/Coupon";

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
walletRouter.get(
  "/my-crypto-objects",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const couponRepo = AppDataSource.getRepository(Coupon);
      const cryptoObjects = await couponRepo.find({
        where: { ownerAddress: req.userAddress },
        order: { createdAt: "DESC" },
      });

      res.json(cryptoObjects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
