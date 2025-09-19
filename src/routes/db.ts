import { Router } from "express";
import { initDataSource, AppDataSource } from "../db/data-source";
import { User } from "../entities/User";

export const dbRouter = Router();

/**
 * @openapi
 * /db/health:
 *   get:
 *     tags:
 *       - 데이터베이스
 *     summary: 데이터베이스 연결 상태 확인
 *     description: MariaDB 연결 상태를 확인하고 간단한 쿼리를 실행
 *     responses:
 *       200:
 *         description: 데이터베이스 연결 정상
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: 데이터베이스 연결 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: 오류 메시지
 */
dbRouter.get("/health", async (_req, res) => {
  try {
    await initDataSource();
    await AppDataSource.query("SELECT 1");
    
    // User 엔티티 테스트
    const userRepo = AppDataSource.getRepository(User);
    const userCount = await userRepo.count();
    
    res.json({ 
      ok: true, 
      database: "connected",
      entities: "loaded",
      userCount: userCount
    });
  } catch (e: any) {
    console.error("Database health check failed:", e);
    res.status(500).json({ 
      ok: false, 
      error: e.message,
      stack: e.stack
    });
  }
});
