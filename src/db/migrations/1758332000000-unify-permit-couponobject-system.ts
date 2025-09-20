import { MigrationInterface, QueryRunner } from "typeorm";

export class UnifyPermitCouponobjectSystem1758332000000 implements MigrationInterface {
    name = 'UnifyPermitCouponobjectSystem1758332000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // CouponObject 테이블에 주소 기반 컬럼 추가
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` ADD \`owner_address\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` ADD \`supplier_address\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` ADD \`issuer_address\` varchar(100) NULL`);
        
        // 기존 ID 기반 데이터를 주소로 마이그레이션
        await queryRunner.query(`
            UPDATE \`coupon_objects\` co 
            JOIN \`users\` u ON co.owner_id = u.id 
            SET co.owner_address = u.address
        `);
        
        await queryRunner.query(`
            UPDATE \`coupon_objects\` co 
            JOIN \`users\` u ON co.supplier_id = u.id 
            SET co.supplier_address = u.address
        `);
        
        await queryRunner.query(`
            UPDATE \`coupon_objects\` co 
            JOIN \`users\` u ON co.issuer_id = u.id 
            SET co.issuer_address = u.address
        `);
        
        // 새 컬럼을 NOT NULL로 변경
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` MODIFY COLUMN \`owner_address\` varchar(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` MODIFY COLUMN \`supplier_address\` varchar(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` MODIFY COLUMN \`issuer_address\` varchar(100) NOT NULL`);
        
        // 인덱스 추가
        await queryRunner.query(`CREATE INDEX \`IDX_coupon_objects_owner_address\` ON \`coupon_objects\` (\`owner_address\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_coupon_objects_supplier_address\` ON \`coupon_objects\` (\`supplier_address\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_coupon_objects_issuer_address\` ON \`coupon_objects\` (\`issuer_address\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 인덱스 제거
        await queryRunner.query(`DROP INDEX \`IDX_coupon_objects_issuer_address\` ON \`coupon_objects\``);
        await queryRunner.query(`DROP INDEX \`IDX_coupon_objects_supplier_address\` ON \`coupon_objects\``);
        await queryRunner.query(`DROP INDEX \`IDX_coupon_objects_owner_address\` ON \`coupon_objects\``);
        
        // 새 컬럼 제거
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` DROP COLUMN \`issuer_address\``);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` DROP COLUMN \`supplier_address\``);
        await queryRunner.query(`ALTER TABLE \`coupon_objects\` DROP COLUMN \`owner_address\``);
    }
}
