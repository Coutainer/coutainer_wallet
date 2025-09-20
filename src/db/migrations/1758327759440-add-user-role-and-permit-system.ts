import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRoleAndPermitSystem1758327759440
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // User 테이블에 계급 관련 컬럼 추가
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`role\` enum('CONSUMER', 'BUSINESS') NOT NULL DEFAULT 'CONSUMER'`
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_name\` varchar(200) NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_description\` text NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_logo\` varchar(500) NULL`
    );

    // SupplierPermit 테이블 생성
    await queryRunner.query(`CREATE TABLE \`supplier_permits\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`supplier_id\` int NOT NULL,
            \`buyer_id\` int NULL,
            \`title\` varchar(200) NOT NULL,
            \`description\` text,
            \`image_url\` varchar(500),
            \`scope\` varchar(100) NOT NULL,
            \`limit\` varchar(255) NOT NULL,
            \`face_value\` varchar(255) NOT NULL,
            \`total_value\` varchar(255) NOT NULL,
            \`price\` varchar(255) NOT NULL,
            \`expiry\` datetime NOT NULL,
            \`status\` enum('LISTED', 'SOLD', 'REDEEMED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'LISTED',
            \`signature\` varchar(500),
            \`nonce\` varchar(100),
            \`sold_at\` datetime,
            \`redeemed_at\` datetime,
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            KEY \`FK_supplier_permits_supplier\` (\`supplier_id\`),
            KEY \`FK_supplier_permits_buyer\` (\`buyer_id\`),
            CONSTRAINT \`FK_supplier_permits_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_supplier_permits_buyer\` FOREIGN KEY (\`buyer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);

    // SupplierCap 테이블 생성
    await queryRunner.query(`CREATE TABLE \`supplier_caps\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`permit_id\` int NOT NULL,
            \`owner_id\` int NOT NULL,
            \`supplier_id\` int NOT NULL,
            \`scope\` varchar(100) NOT NULL,
            \`remaining\` varchar(255) NOT NULL,
            \`original_limit\` varchar(255) NOT NULL,
            \`face_value\` varchar(255) NOT NULL,
            \`title\` varchar(200) NOT NULL,
            \`description\` text,
            \`image_url\` varchar(500),
            \`expiry\` datetime NOT NULL,
            \`status\` enum('ACTIVE', 'FROZEN', 'EXPIRED', 'EXHAUSTED') NOT NULL DEFAULT 'ACTIVE',
            \`frozen\` tinyint NOT NULL DEFAULT 0,
            \`issued_count\` int NOT NULL DEFAULT 0,
            \`total_value_issued\` varchar(255) NOT NULL DEFAULT '0',
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            KEY \`FK_supplier_caps_permit\` (\`permit_id\`),
            KEY \`FK_supplier_caps_owner\` (\`owner_id\`),
            KEY \`FK_supplier_caps_supplier\` (\`supplier_id\`),
            CONSTRAINT \`FK_supplier_caps_permit\` FOREIGN KEY (\`permit_id\`) REFERENCES \`supplier_permits\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_supplier_caps_owner\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_supplier_caps_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`supplier_caps\``);
    await queryRunner.query(`DROP TABLE \`supplier_permits\``);
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_logo\``
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_description\``
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_name\``
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`role\``);
  }
}
