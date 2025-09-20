import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUpdatedAtFromUsers1758328623289
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // users 테이블에서 updatedAt 컬럼 제거
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`updatedAt\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // updatedAt 컬럼 복원
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`
    );
  }
}
