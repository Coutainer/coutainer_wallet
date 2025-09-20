import { MigrationInterface, QueryRunner } from "typeorm";

export class FixCouponObjectExpirationField1758328084034
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // expiration 컬럼을 expiresAt으로 변경
    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` CHANGE \`expiration\` \`expires_at\` datetime NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // expiresAt 컬럼을 expiration으로 되돌리기
    await queryRunner.query(
      `ALTER TABLE \`coupon_objects\` CHANGE \`expires_at\` \`expiration\` datetime NOT NULL`
    );
  }
}
