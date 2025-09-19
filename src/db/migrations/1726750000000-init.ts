import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1726750000000 implements MigrationInterface {
  name = "Init1726750000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        address VARCHAR(200) NOT NULL UNIQUE,
        nickname VARCHAR(200) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        objectId VARCHAR(200) NOT NULL UNIQUE,
        type VARCHAR(100) NOT NULL,
        value BIGINT NOT NULL,
        expiryTimeMs BIGINT NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        ownerAddress VARCHAR(200) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_ownerAddress (ownerAddress)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE coupon_sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        couponObjectId VARCHAR(200) NOT NULL,
        sellerAddress VARCHAR(200) NOT NULL,
        priceMist BIGINT NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_couponObjectId (couponObjectId),
        INDEX idx_active (active)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        address VARCHAR(200) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT NULL,
        website VARCHAR(200) NULL,
        verified TINYINT(1) NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        verifiedBy VARCHAR(200) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE publishers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        address VARCHAR(200) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT NULL,
        website VARCHAR(200) NULL,
        verified TINYINT(1) NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        verifiedBy VARCHAR(200) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE collaterals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        publisherAddress VARCHAR(200) NOT NULL,
        providerAddress VARCHAR(200) NOT NULL,
        amountMist BIGINT NOT NULL,
        usedAmountMist BIGINT NOT NULL DEFAULT 0,
        availableAmountMist BIGINT NOT NULL,
        transactionDigest VARCHAR(200) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_publisherAddress (publisherAddress),
        INDEX idx_providerAddress (providerAddress)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE gift_boxes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ownerAddress VARCHAR(200) NOT NULL,
        couponObjectId VARCHAR(200) NOT NULL,
        recipientAddress VARCHAR(200) NULL,
        qrCode VARCHAR(500) NULL,
        transferCode VARCHAR(200) NULL,
        isTransferred TINYINT(1) NOT NULL DEFAULT 0,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_ownerAddress (ownerAddress),
        INDEX idx_transferCode (transferCode)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE points (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userAddress VARCHAR(200) NOT NULL UNIQUE,
        balance BIGINT NOT NULL DEFAULT 0,
        totalEarned BIGINT NOT NULL DEFAULT 0,
        totalSpent BIGINT NOT NULL DEFAULT 0,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS points");
    await queryRunner.query("DROP TABLE IF EXISTS gift_boxes");
    await queryRunner.query("DROP TABLE IF EXISTS collaterals");
    await queryRunner.query("DROP TABLE IF EXISTS publishers");
    await queryRunner.query("DROP TABLE IF EXISTS suppliers");
    await queryRunner.query("DROP TABLE IF EXISTS coupon_sales");
    await queryRunner.query("DROP TABLE IF EXISTS coupons");
    await queryRunner.query("DROP TABLE IF EXISTS users");
  }
}
