import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWalletFields1758297003929 implements MigrationInterface {
    name = 'AddWalletFields1758297003929'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`address\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`objectId\` ON \`coupons\``);
        await queryRunner.query(`DROP INDEX \`idx_ownerAddress\` ON \`coupons\``);
        await queryRunner.query(`DROP INDEX \`idx_couponObjectId\` ON \`coupon_sales\``);
        await queryRunner.query(`DROP INDEX \`idx_active\` ON \`coupon_sales\``);
        await queryRunner.query(`DROP INDEX \`userAddress\` ON \`points\``);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`mnemonic\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`hasWallet\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD UNIQUE INDEX \`IDX_b0ec0293d53a1385955f9834d5\` (\`address\`)`);
        await queryRunner.query(`ALTER TABLE \`coupons\` ADD UNIQUE INDEX \`IDX_f4855d187c9ea5a664ce196688\` (\`objectId\`)`);
        await queryRunner.query(`ALTER TABLE \`coupons\` CHANGE \`used\` \`used\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`coupon_sales\` CHANGE \`active\` \`active\` tinyint NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE \`points\` ADD UNIQUE INDEX \`IDX_49fb80a59c5b9d83c780399e4b\` (\`userAddress\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_b7133389ff55a300e985ce120f\` ON \`coupon_sales\` (\`couponObjectId\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_b7133389ff55a300e985ce120f\` ON \`coupon_sales\``);
        await queryRunner.query(`ALTER TABLE \`points\` DROP INDEX \`IDX_49fb80a59c5b9d83c780399e4b\``);
        await queryRunner.query(`ALTER TABLE \`coupon_sales\` CHANGE \`active\` \`active\` tinyint(1) NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE \`coupons\` CHANGE \`used\` \`used\` tinyint(1) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`coupons\` DROP INDEX \`IDX_f4855d187c9ea5a664ce196688\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP INDEX \`IDX_b0ec0293d53a1385955f9834d5\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`hasWallet\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`mnemonic\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`userAddress\` ON \`points\` (\`userAddress\`)`);
        await queryRunner.query(`CREATE INDEX \`idx_active\` ON \`coupon_sales\` (\`active\`)`);
        await queryRunner.query(`CREATE INDEX \`idx_couponObjectId\` ON \`coupon_sales\` (\`couponObjectId\`)`);
        await queryRunner.query(`CREATE INDEX \`idx_ownerAddress\` ON \`coupons\` (\`ownerAddress\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`objectId\` ON \`coupons\` (\`objectId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`address\` ON \`users\` (\`address\`)`);
    }

}
