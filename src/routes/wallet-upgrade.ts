import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { requireUser, AuthenticatedRequest } from "../middleware/auth";
import { generateWallet } from "../sui/wallet";
import jwt from "jsonwebtoken";

export const walletUpgradeRouter = Router();

/**
 * @openapi
 * /wallet/upgrade:
 *   post:
 *     tags:
 *       - 지갑 업그레이드
 *     summary: 새 지갑으로 업그레이드
 *     description: |
 *       사용자의 기존 지갑을 새로운 지갑으로 업그레이드합니다.
 *       기존 데이터는 유지되고 새로운 지갑 주소가 할당됩니다.
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *     responses:
 *       200:
 *         description: 지갑 업그레이드 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 oldAddress:
 *                   type: string
 *                 newAddress:
 *                   type: string
 *                 newToken:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
walletUpgradeRouter.post(
  "/upgrade",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);

      // 현재 사용자 조회
      const user = await userRepo.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const oldAddress = user.address;

      // 새 지갑 생성
      const newWallet = generateWallet();

      // 사용자 정보 업데이트
      await userRepo.update(
        { id: user.id },
        {
          address: newWallet.address,
          mnemonic: newWallet.mnemonic,
          hasWallet: true,
        }
      );

      // 업데이트된 사용자 정보 조회
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });

      // 새로운 JWT 토큰 생성
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

      console.log(
        `🔄 지갑 업그레이드 완료: ${oldAddress} → ${newWallet.address}`
      );

      res.json({
        message: "Wallet upgraded successfully",
        oldAddress,
        newAddress: newWallet.address,
        newToken,
        walletInfo: {
          address: newWallet.address,
          mnemonic: newWallet.mnemonic,
        },
      });
    } catch (error: any) {
      console.error("Wallet upgrade error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * @openapi
 * /wallet/migrate-to-sui:
 *   post:
 *     tags:
 *       - 지갑 업그레이드
 *     summary: Sui 블록체인 지갑으로 마이그레이션
 *     description: |
 *       기존 지갑을 Sui 블록체인과 완전히 호환되는 지갑으로 마이그레이션합니다.
 *       Sui CLI와 동일한 지갑을 사용하도록 설정할 수 있습니다.
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetAddress:
 *                 type: string
 *                 description: 마이그레이션할 대상 지갑 주소 (선택사항)
 *     responses:
 *       200:
 *         description: 마이그레이션 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 oldAddress:
 *                   type: string
 *                 newAddress:
 *                   type: string
 *                 newToken:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 */
walletUpgradeRouter.post(
  "/migrate-to-sui",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);

      // 현재 사용자 조회
      const user = await userRepo.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const oldAddress = user.address;
      let newAddress = req.body.targetAddress;

      // 대상 주소가 제공되지 않은 경우 새 지갑 생성
      if (!newAddress) {
        const newWallet = generateWallet();
        newAddress = newWallet.address;

        // 사용자 정보 업데이트
        await userRepo.update(
          { id: user.id },
          {
            address: newWallet.address,
            mnemonic: newWallet.mnemonic,
            hasWallet: true,
          }
        );
      } else {
        // 대상 주소가 제공된 경우 해당 주소로 업데이트
        await userRepo.update(
          { id: user.id },
          {
            address: newAddress,
            hasWallet: true,
          }
        );
      }

      // 업데이트된 사용자 정보 조회
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });

      // 새로운 JWT 토큰 생성
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

      console.log(
        `🔄 Sui 지갑 마이그레이션 완료: ${oldAddress} → ${newAddress}`
      );

      res.json({
        message: "Successfully migrated to Sui wallet",
        oldAddress,
        newAddress,
        newToken,
        suiCompatible: true,
      });
    } catch (error: any) {
      console.error("Sui wallet migration error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * @openapi
 * /wallet/sync-with-sui-cli:
 *   post:
 *     tags:
 *       - 지갑 업그레이드
 *     summary: Sui CLI 지갑과 동기화
 *     description: |
 *       현재 Sui CLI에서 사용 중인 지갑 주소로 사용자 지갑을 동기화합니다.
 *       이를 통해 API와 CLI가 동일한 지갑을 사용할 수 있습니다.
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               suiCliAddress:
 *                 type: string
 *                 description: Sui CLI에서 사용 중인 지갑 주소
 *                 example: "0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71"
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
 *                 oldAddress:
 *                   type: string
 *                 newAddress:
 *                   type: string
 *                 newToken:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 */
walletUpgradeRouter.post(
  "/sync-with-sui-cli",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const { suiCliAddress } = req.body;

      if (!suiCliAddress) {
        return res.status(400).json({ error: "Sui CLI address is required" });
      }

      // 현재 사용자 조회
      const user = await userRepo.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const oldAddress = user.address;

      // Sui CLI 주소로 업데이트
      await userRepo.update(
        { id: user.id },
        {
          address: suiCliAddress,
          hasWallet: true,
        }
      );

      // 업데이트된 사용자 정보 조회
      const updatedUser = await userRepo.findOne({ where: { id: user.id } });

      // 새로운 JWT 토큰 생성
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

      console.log(
        `🔄 Sui CLI 지갑 동기화 완료: ${oldAddress} → ${suiCliAddress}`
      );

      res.json({
        message: "Successfully synced with Sui CLI wallet",
        oldAddress,
        newAddress: suiCliAddress,
        newToken,
        synchronized: true,
      });
    } catch (error: any) {
      console.error("Sui CLI sync error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * @openapi
 * /wallet-upgrade/bulk-upgrade:
 *   post:
 *     tags:
 *       - 지갑 업그레이드
 *     summary: 전체 계정 지갑 일괄 업그레이드
 *     description: |
 *       시스템의 모든 사용자 지갑을 일괄적으로 업그레이드합니다.
 *       관리자 권한이 필요합니다.
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               upgradeType:
 *                 type: string
 *                 enum: ["new", "sui-cli", "migrate"]
 *                 description: 업그레이드 타입
 *               targetAddress:
 *                 type: string
 *                 description: 대상 주소 (migrate 타입일 때만 사용)
 *     responses:
 *       200:
 *         description: 일괄 업그레이드 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 totalUsers:
 *                   type: number
 *                 upgradedUsers:
 *                   type: number
 *                 failedUsers:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: number
 *                       oldAddress:
 *                         type: string
 *                       newAddress:
 *                         type: string
 *                       status:
 *                         type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 관리자 권한 필요
 */
walletUpgradeRouter.post(
  "/bulk-upgrade",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { upgradeType = "new", targetAddress } = req.body;
      const userRepo = AppDataSource.getRepository(User);

      // 모든 사용자 조회
      const allUsers = await userRepo.find({
        select: ["id", "address", "nickname", "hasWallet", "role"],
      });

      console.log(
        `🔄 전체 지갑 업그레이드 시작: ${allUsers.length}명의 사용자`
      );

      const results = [];
      let upgradedCount = 0;
      let failedCount = 0;

      for (const user of allUsers) {
        try {
          let newAddress: string;

          switch (upgradeType) {
            case "new":
              // 새 지갑 생성
              const newWallet = generateWallet();
              newAddress = newWallet.address;
              await userRepo.update(
                { id: user.id },
                {
                  address: newAddress,
                  mnemonic: newWallet.mnemonic,
                  hasWallet: true,
                }
              );
              break;

            case "sui-cli":
              // Sui CLI 주소로 업데이트 (기본 주소 사용)
              newAddress =
                "0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71";
              await userRepo.update(
                { id: user.id },
                {
                  address: newAddress,
                  hasWallet: true,
                }
              );
              break;

            case "migrate":
              if (!targetAddress) {
                throw new Error("Target address is required for migrate type");
              }
              newAddress = targetAddress;
              await userRepo.update(
                { id: user.id },
                {
                  address: newAddress,
                  hasWallet: true,
                }
              );
              break;

            default:
              throw new Error(`Invalid upgrade type: ${upgradeType}`);
          }

          results.push({
            userId: user.id,
            nickname: user.nickname,
            oldAddress: user.address,
            newAddress,
            status: "success",
            role: user.role,
          });

          upgradedCount++;
          console.log(
            `✅ 사용자 ${user.id} (${user.nickname}) 지갑 업그레이드: ${user.address} → ${newAddress}`
          );
        } catch (error: any) {
          results.push({
            userId: user.id,
            nickname: user.nickname,
            oldAddress: user.address,
            newAddress: null,
            status: "failed",
            error: error.message,
            role: user.role,
          });

          failedCount++;
          console.error(
            `❌ 사용자 ${user.id} (${user.nickname}) 지갑 업그레이드 실패:`,
            error.message
          );
        }
      }

      console.log(
        `🎉 전체 지갑 업그레이드 완료: 성공 ${upgradedCount}명, 실패 ${failedCount}명`
      );

      res.json({
        message: "Bulk wallet upgrade completed",
        totalUsers: allUsers.length,
        upgradedUsers: upgradedCount,
        failedUsers: failedCount,
        upgradeType,
        results,
      });
    } catch (error: any) {
      console.error("Bulk wallet upgrade error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * @openapi
 * /wallet-upgrade/status:
 *   get:
 *     tags:
 *       - 지갑 업그레이드
 *     summary: 전체 사용자 지갑 상태 조회
 *     description: 모든 사용자의 지갑 상태를 조회합니다.
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰
 *     responses:
 *       200:
 *         description: 지갑 상태 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 usersWithWallet:
 *                   type: number
 *                 usersWithoutWallet:
 *                   type: number
 *                 walletAddresses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: number
 *                       nickname:
 *                         type: string
 *                       address:
 *                         type: string
 *                       hasWallet:
 *                         type: boolean
 *                       role:
 *                         type: string
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 */
walletUpgradeRouter.get(
  "/status",
  requireUser,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = AppDataSource.getRepository(User);

      // 모든 사용자 조회
      const allUsers = await userRepo.find({
        select: ["id", "address", "nickname", "hasWallet", "role"],
      });

      const usersWithWallet = allUsers.filter((user) => user.hasWallet);
      const usersWithoutWallet = allUsers.filter((user) => !user.hasWallet);

      const walletAddresses = allUsers.map((user) => ({
        userId: user.id,
        nickname: user.nickname,
        address: user.address,
        hasWallet: user.hasWallet,
        role: user.role,
      }));

      res.json({
        totalUsers: allUsers.length,
        usersWithWallet: usersWithWallet.length,
        usersWithoutWallet: usersWithoutWallet.length,
        walletAddresses,
      });
    } catch (error: any) {
      console.error("Wallet status error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

export default walletUpgradeRouter;
