import { Router } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { Point } from "../entities/Point";
import { SupplierPermit } from "../entities/SupplierPermit";
import { SupplierCap } from "../entities/SupplierCap";
import { CouponObject } from "../entities/CouponObject";
import { EscrowAccount } from "../entities/EscrowAccount";
import { TradeTransaction } from "../entities/TradeTransaction";
import { IssuanceStamp } from "../entities/IssuanceStamp";

const debugRouter = Router();

/**
 * @openapi
 * /debug/clear-all:
 *   delete:
 *     tags:
 *       - Debug (개발용)
 *     summary: 모든 데이터 삭제
 *     description: |
 *       **⚠️ 개발/테스트 환경 전용 API**
 *       - 모든 테이블의 데이터를 삭제합니다
 *       - 프로덕션 환경에서는 절대 사용하지 마세요
 *       - 외래키 제약조건을 고려하여 올바른 순서로 삭제합니다
 *     responses:
 *       200:
 *         description: 모든 데이터 삭제 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedCounts:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: number
 *                     points:
 *                       type: number
 *                     supplierPermits:
 *                       type: number
 *                     supplierCaps:
 *                       type: number
 *                     couponObjects:
 *                       type: number
 *                     escrowAccounts:
 *                       type: number
 *                     tradeTransactions:
 *                       type: number
 *                     issuanceStamps:
 *                       type: number
 *       500:
 *         description: 서버 오류
 */
debugRouter.delete("/clear-all", async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    console.log("🧹 Starting data cleanup...");

    // 삭제 순서: 외래키 제약조건을 고려하여 역순으로 삭제
    const deletedCounts: any = {};

    // 1. TradeTransaction 삭제
    const tradeTransactionRepo =
      queryRunner.manager.getRepository(TradeTransaction);
    const tradeTransactionResult = await tradeTransactionRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.tradeTransactions = tradeTransactionResult.affected || 0;
    console.log(
      `✅ Deleted ${deletedCounts.tradeTransactions} trade transactions`
    );

    // 2. CouponObject 삭제
    const couponObjectRepo = queryRunner.manager.getRepository(CouponObject);
    const couponObjectResult = await couponObjectRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.couponObjects = couponObjectResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.couponObjects} coupon objects`);

    // 3. SupplierCap 삭제
    const supplierCapRepo = queryRunner.manager.getRepository(SupplierCap);
    const supplierCapResult = await supplierCapRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.supplierCaps = supplierCapResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.supplierCaps} supplier caps`);

    // 4. SupplierPermit 삭제
    const supplierPermitRepo =
      queryRunner.manager.getRepository(SupplierPermit);
    const supplierPermitResult = await supplierPermitRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.supplierPermits = supplierPermitResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.supplierPermits} supplier permits`);

    // 5. IssuanceStamp 삭제
    const issuanceStampRepo = queryRunner.manager.getRepository(IssuanceStamp);
    const issuanceStampResult = await issuanceStampRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.issuanceStamps = issuanceStampResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.issuanceStamps} issuance stamps`);

    // 6. EscrowAccount 삭제
    const escrowAccountRepo = queryRunner.manager.getRepository(EscrowAccount);
    const escrowAccountResult = await escrowAccountRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.escrowAccounts = escrowAccountResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.escrowAccounts} escrow accounts`);

    // 7. Point 삭제
    const pointRepo = queryRunner.manager.getRepository(Point);
    const pointResult = await pointRepo.createQueryBuilder().delete().execute();
    deletedCounts.points = pointResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.points} points`);

    // 8. User 삭제 (마지막)
    const userRepo = queryRunner.manager.getRepository(User);
    const userResult = await userRepo.createQueryBuilder().delete().execute();
    deletedCounts.users = userResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.users} users`);

    await queryRunner.commitTransaction();

    console.log("🎉 All data cleared successfully!");

    res.json({
      message: "All data cleared successfully",
      deletedCounts,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("❌ Error clearing data:", error);
    res.status(500).json({
      error: "Failed to clear data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await queryRunner.release();
  }
});

/**
 * @openapi
 * /debug/reset-sequences:
 *   post:
 *     tags:
 *       - Debug (개발용)
 *     summary: 시퀀스 리셋
 *     description: |
 *       **⚠️ 개발/테스트 환경 전용 API**
 *       - 모든 테이블의 AUTO_INCREMENT 시퀀스를 1로 리셋합니다
 *       - 프로덕션 환경에서는 절대 사용하지 마세요
 *     responses:
 *       200:
 *         description: 시퀀스 리셋 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: 서버 오류
 */
debugRouter.post("/reset-sequences", async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    console.log("🔄 Resetting sequences...");

    // MariaDB/MySQL에서 AUTO_INCREMENT 리셋
    const tables = [
      "users",
      "points",
      "supplier_permits",
      "supplier_caps",
      "coupon_objects",
      "escrow_accounts",
      "trade_transactions",
      "issuance_stamps",
    ];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      console.log(`✅ Reset ${table} sequence`);
    }

    await queryRunner.commitTransaction();

    console.log("🎉 All sequences reset successfully!");

    res.json({
      message: "All sequences reset successfully",
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("❌ Error resetting sequences:", error);
    res.status(500).json({
      error: "Failed to reset sequences",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await queryRunner.release();
  }
});

/**
 * @openapi
 * /debug/full-reset:
 *   delete:
 *     tags:
 *       - Debug (개발용)
 *     summary: 완전 초기화
 *     description: |
 *       **⚠️ 개발/테스트 환경 전용 API**
 *       - 모든 데이터 삭제 + 시퀀스 리셋을 한 번에 수행합니다
 *       - 프로덕션 환경에서는 절대 사용하지 마세요
 *     responses:
 *       200:
 *         description: 완전 초기화 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedCounts:
 *                   type: object
 *       500:
 *         description: 서버 오류
 */
debugRouter.delete("/full-reset", async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    console.log("🚀 Starting full reset...");

    // 1. 모든 데이터 삭제
    const deletedCounts: any = {};

    // TradeTransaction 삭제
    const tradeTransactionRepo =
      queryRunner.manager.getRepository(TradeTransaction);
    const tradeTransactionResult = await tradeTransactionRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.tradeTransactions = tradeTransactionResult.affected || 0;
    console.log(
      `✅ Deleted ${deletedCounts.tradeTransactions} trade transactions`
    );

    // CouponObject 삭제
    const couponObjectRepo = queryRunner.manager.getRepository(CouponObject);
    const couponObjectResult = await couponObjectRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.couponObjects = couponObjectResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.couponObjects} coupon objects`);

    // SupplierCap 삭제
    const supplierCapRepo = queryRunner.manager.getRepository(SupplierCap);
    const supplierCapResult = await supplierCapRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.supplierCaps = supplierCapResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.supplierCaps} supplier caps`);

    // SupplierPermit 삭제
    const supplierPermitRepo =
      queryRunner.manager.getRepository(SupplierPermit);
    const supplierPermitResult = await supplierPermitRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.supplierPermits = supplierPermitResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.supplierPermits} supplier permits`);

    // IssuanceStamp 삭제
    const issuanceStampRepo = queryRunner.manager.getRepository(IssuanceStamp);
    const issuanceStampResult = await issuanceStampRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.issuanceStamps = issuanceStampResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.issuanceStamps} issuance stamps`);

    // EscrowAccount 삭제
    const escrowAccountRepo = queryRunner.manager.getRepository(EscrowAccount);
    const escrowAccountResult = await escrowAccountRepo
      .createQueryBuilder()
      .delete()
      .execute();
    deletedCounts.escrowAccounts = escrowAccountResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.escrowAccounts} escrow accounts`);

    // Point 삭제
    const pointRepo = queryRunner.manager.getRepository(Point);
    const pointResult = await pointRepo.createQueryBuilder().delete().execute();
    deletedCounts.points = pointResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.points} points`);

    // User 삭제
    const userRepo = queryRunner.manager.getRepository(User);
    const userResult = await userRepo.createQueryBuilder().delete().execute();
    deletedCounts.users = userResult.affected || 0;
    console.log(`✅ Deleted ${deletedCounts.users} users`);

    // 2. 시퀀스 리셋
    console.log("🔄 Resetting sequences...");
    const tables = [
      "users",
      "points",
      "supplier_permits",
      "supplier_caps",
      "coupon_objects",
      "escrow_accounts",
      "trade_transactions",
      "issuance_stamps",
    ];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      console.log(`✅ Reset ${table} sequence`);
    }

    await queryRunner.commitTransaction();

    console.log("🎉 Full reset completed successfully!");

    res.json({
      message: "Full reset completed successfully",
      deletedCounts,
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("❌ Error during full reset:", error);
    res.status(500).json({
      error: "Failed to perform full reset",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await queryRunner.release();
  }
});

export default debugRouter;


