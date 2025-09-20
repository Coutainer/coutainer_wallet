import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveAllDatetimeColumns1758329125585
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 모든 테이블에서 createdAt, updatedAt 컬럼 제거
    await queryRunner.query(
      `ALTER TABLE \`supplier_permits\` DROP COLUMN \`created_at\``
    );
    await queryRunner.query(
      `ALTER TABLE \`supplier_permits\` DROP COLUMN \`updated_at\``
    );

    await queryRunner.query(
      `ALTER TABLE \`supplier_caps\` DROP COLUMN \`created_at\``
    );
    await queryRunner.query(
      `ALTER TABLE \`supplier_caps\` DROP COLUMN \`updated_at\``
    );

    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` DROP COLUMN \`created_at\``
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` DROP COLUMN \`updated_at\``
    );

    await queryRunner.query(
      `ALTER TABLE \`escrow_accounts\` DROP COLUMN \`created_at\``
    );
    await queryRunner.query(
      `ALTER TABLE \`escrow_accounts\` DROP COLUMN \`updated_at\``
    );

    await queryRunner.query(
      `ALTER TABLE \`trade_transactions\` DROP COLUMN \`created_at\``
    );

    await queryRunner.query(
      `ALTER TABLE \`issuance_stamps\` DROP COLUMN \`created_at\``
    );
    await queryRunner.query(
      `ALTER TABLE \`issuance_stamps\` DROP COLUMN \`updated_at\``
    );

    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`createdAt\``);

    await queryRunner.query(`ALTER TABLE \`points\` DROP COLUMN \`createdAt\``);
    await queryRunner.query(`ALTER TABLE \`points\` DROP COLUMN \`updatedAt\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 컬럼들 복원 (필요시)
    await queryRunner.query(
      `ALTER TABLE \`supplier_permits\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`supplier_permits\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`supplier_caps\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`supplier_caps\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`escrow_accounts\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`escrow_accounts\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`trade_transactions\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`issuance_stamps\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`issuance_stamps\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );

    await queryRunner.query(
      `ALTER TABLE \`points\` ADD \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`
    );
    await queryRunner.query(
      `ALTER TABLE \`points\` ADD \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );
  }
}
