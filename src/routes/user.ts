import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { User, UserRole } from "../entities/User";
import {
  requireUser,
  requireUserWithRole,
  requireBusiness,
  requireConsumer,
  AuthenticatedRequest,
} from "../middleware/auth";
import jwt from "jsonwebtoken";

export const userRouter = Router();

// Business 계정 전환 스키마 (토큰만 반환)
const upgradeToBusinessSchema = z.object({});

/**
 * @openapi
 * /user/profile:
 *   get:
 *     tags:
 *       - 사용자 관리
 *     summary: 사용자 프로필 조회
 *     description: 현재 사용자의 프로필 정보를 조회합니다
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
 *         description: 프로필 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 address:
 *                   type: string
 *                 nickname:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [CONSUMER, BUSINESS]
 *                 businessName:
 *                   type: string
 *                 businessDescription:
 *                   type: string
 *                 businessLogo:
 *                   type: string
 *                 hasWallet:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 인증 필요
 */
userRouter.get(
  "/profile",
  requireUserWithRole,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        address: user.address,
        nickname: user.nickname,
        role: user.role,
        hasWallet: user.hasWallet,
      });
    } catch (err: any) {
      console.error("Profile fetch error:", err);
      res.status(400).json({ error: err.message || "Failed to fetch profile" });
    }
  }
);

/**
 * @openapi
 * /user/upgrade-to-business:
 *   post:
 *     tags:
 *       - 사용자 관리
 *     summary: Business 계정으로 전환
 *     description: 일반 사용자를 Business 계정으로 전환합니다
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
 *             properties: {}
 *     responses:
 *       200:
 *         description: Business 계정 전환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: "갱신된 JWT 토큰"
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 이미 Business 계정
 */
userRouter.post(
  "/upgrade-to-business",
  requireUserWithRole,
  requireConsumer,
  async (req: AuthenticatedRequest, res) => {
    try {
      const body = upgradeToBusinessSchema.parse(req.body);
      const userRepo = AppDataSource.getRepository(User);

      // 사용자 조회
      const user = await userRepo.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // 이미 Business 계정인지 확인
      if (user.role === UserRole.BUSINESS) {
        return res.status(400).json({ error: "Already a business account" });
      }

      // Business 계정으로 전환
      await userRepo.update(
        { id: user.id },
        {
          role: UserRole.BUSINESS,
        }
      );

      // 업데이트된 사용자 정보 조회
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });

      // 새로운 JWT 토큰 생성 (role 정보 포함)
      const newToken = jwt.sign(
        {
          sub: updatedUser!.id,
          address: updatedUser!.address,
          iss: "coutainer",
          email: req.userEmail,
          role: updatedUser!.role,
        },
        process.env.SESSION_SECRET || "your-secret-key-here",
        { expiresIn: "7d" }
      );

      res.json({
        message: "Successfully upgraded to business account",
        token: newToken,
      });
    } catch (err: any) {
      console.error("Business upgrade error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * @openapi
 * /user/downgrade-to-consumer:
 *   post:
 *     tags:
 *       - 사용자 관리
 *     summary: Consumer 계정으로 전환
 *     description: Business 계정을 일반 사용자 계정으로 전환합니다
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
 *         description: Consumer 계정 전환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: "갱신된 JWT 토큰"
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 이미 Consumer 계정
 */
userRouter.post(
  "/downgrade-to-consumer",
  requireUserWithRole,
  requireBusiness,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);

      // 사용자 조회
      const user = await userRepo.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // 이미 Consumer 계정인지 확인
      if (user.role === UserRole.CONSUMER) {
        return res.status(400).json({ error: "Already a consumer account" });
      }

      // Consumer 계정으로 전환
      await userRepo.update(
        { id: user.id },
        {
          role: UserRole.CONSUMER,
        }
      );

      // 업데이트된 사용자 정보 조회
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });

      // 새로운 JWT 토큰 생성 (role 정보 포함)
      const newToken = jwt.sign(
        {
          sub: updatedUser!.id,
          address: updatedUser!.address,
          iss: "coutainer",
          email: req.userEmail,
          role: updatedUser!.role,
        },
        process.env.SESSION_SECRET || "your-secret-key-here",
        { expiresIn: "7d" }
      );

      res.json({
        message: "Successfully downgraded to consumer account",
        token: newToken,
      });
    } catch (err: any) {
      console.error("Consumer downgrade error:", err);
      res.status(400).json({ error: err.message });
    }
  }
);

// 비즈니스 정보 업데이트 API는 간소화로 제거됨
