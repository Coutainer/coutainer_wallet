import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { Point } from "../entities/Point";
import {
  requireUser,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/auth";

export const pointRouter = Router();

const chargePointsSchema = z.object({
  targetAddress: z.string().optional(),
  amount: z.string(),
  reason: z.string().optional(),
});

/**
 * @openapi
 * /point/balance:
 *   get:
 *     tags:
 *       - 포인트
 *     summary: 포인트 잔액 조회
 *     description: 사용자의 포인트 잔액을 조회합니다 (토큰에서 자동으로 주소 추출)
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
 *         description: 포인트 잔액 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                 balance:
 *                   type: string
 *                   description: 현재 포인트 잔액
 *                 totalEarned:
 *                   type: string
 *                   description: 총 획득 포인트
 *                 totalSpent:
 *                   type: string
 *                   description: 총 사용 포인트
 *       500:
 *         description: 서버 오류
 */
pointRouter.get(
  "/balance",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    // const auth = req.headers;
    // console.log("auth", auth);
    try {
      const pointRepo = AppDataSource.getRepository(Point);
      let point = await pointRepo.findOne({
        where: { userAddress: req.userAddress },
      });

      if (!point) {
        // Create new point account
        point = pointRepo.create({
          userAddress: req.userAddress!,
          balance: "0",
          totalEarned: "0",
          totalSpent: "0",
        });
        await pointRepo.save(point);
      }

      res.json({
        address: point.userAddress,
        balance: point.balance,
        totalEarned: point.totalEarned,
        totalSpent: point.totalSpent,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /point/charge:
 *   post:
 *     tags:
 *       - 포인트
 *     summary: 포인트 충전
 *     description: 사용자가 포인트를 충전합니다 (targetAddress가 없으면 현재 사용자에게 충전)
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
 *               - amount
 *             properties:
 *               targetAddress:
 *                 type: string
 *                 description: 포인트를 받을 사용자 주소 (선택사항, 없으면 현재 사용자에게 충전)
 *                 example: "0x1234567890abcdef..."
 *               amount:
 *                 type: string
 *                 description: 충전할 포인트 양
 *                 example: "10000"
 *               reason:
 *                 type: string
 *                 description: 충전 사유
 *                 example: "포인트 충전"
 *     responses:
 *       200:
 *         description: 포인트 충전 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 targetAddress:
 *                   type: string
 *                 amount:
 *                   type: string
 *                 newBalance:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
pointRouter.post(
  "/charge",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = chargePointsSchema.parse(req.body);
      const pointRepo = AppDataSource.getRepository(Point);

      // Use targetAddress if provided, otherwise use current user's address
      const targetAddress = body.targetAddress || req.userAddress!;
      console.log("Charging points to:", targetAddress, "Amount:", body.amount);

      // Get or create target user's point account
      let targetPoint = await pointRepo.findOne({
        where: { userAddress: targetAddress },
      });

      if (!targetPoint) {
        targetPoint = pointRepo.create({
          userAddress: targetAddress,
          balance: "0",
          totalEarned: "0",
          totalSpent: "0",
        });
      }

      // Add points to target user
      const newBalance = BigInt(targetPoint.balance) + BigInt(body.amount);
      const newTotalEarned =
        BigInt(targetPoint.totalEarned) + BigInt(body.amount);

      targetPoint.balance = newBalance.toString();
      targetPoint.totalEarned = newTotalEarned.toString();

      await pointRepo.save(targetPoint);

      res.json({
        message: "Points charged successfully",
        targetAddress: targetAddress,
        amount: body.amount,
        reason: body.reason,
        newBalance: targetPoint.balance,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);
