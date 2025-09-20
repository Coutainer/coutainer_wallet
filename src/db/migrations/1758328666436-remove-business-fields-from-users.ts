import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveBusinessFieldsFromUsers1758328666436
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // users 테이블에서 비즈니스 관련 컬럼들 제거
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_name\``
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_description\``
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`business_logo\``
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 비즈니스 관련 컬럼들 복원
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_name\` varchar(200) NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_description\` text NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`business_logo\` varchar(500) NULL`
    );
  }
}
