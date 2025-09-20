import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertPermitToWalletBased1758330000000 implements MigrationInterface {
    name = 'ConvertPermitToWalletBased1758330000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // SupplierPermit 테이블에 새 컬럼 추가
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD \`supplier_address\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD \`buyer_address\` varchar(100) NULL`);
        
        // SupplierCap 테이블에 새 컬럼 추가
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD \`owner_address\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD \`supplier_address\` varchar(100) NULL`);
        
        // EscrowAccount 테이블에 새 컬럼 추가
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` ADD \`supplier_address\` varchar(100) NULL`);
        
        // 기존 데이터 마이그레이션
        await queryRunner.query(`
            UPDATE \`supplier_permits\` sp 
            JOIN \`users\` u ON sp.supplier_id = u.id 
            SET sp.supplier_address = u.address
        `);
        
        await queryRunner.query(`
            UPDATE \`supplier_permits\` sp 
            JOIN \`users\` u ON sp.buyer_id = u.id 
            SET sp.buyer_address = u.address
            WHERE sp.buyer_id IS NOT NULL
        `);
        
        await queryRunner.query(`
            UPDATE \`supplier_caps\` sc 
            JOIN \`users\` u ON sc.owner_id = u.id 
            SET sc.owner_address = u.address
        `);
        
        await queryRunner.query(`
            UPDATE \`supplier_caps\` sc 
            JOIN \`users\` u ON sc.supplier_id = u.id 
            SET sc.supplier_address = u.address
        `);
        
        await queryRunner.query(`
            UPDATE \`escrow_accounts\` ea 
            JOIN \`users\` u ON ea.supplier_id = u.id 
            SET ea.supplier_address = u.address
        `);
        
        // 새 컬럼을 NOT NULL로 변경
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` MODIFY \`supplier_address\` varchar(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` MODIFY \`owner_address\` varchar(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` MODIFY \`supplier_address\` varchar(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` MODIFY \`supplier_address\` varchar(100) NOT NULL`);
        
        // 외래키 제거
        try {
            await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP FOREIGN KEY \`FK_supplier_permits_supplier_id\``);
        } catch (e) {
            // 외래키가 없을 수 있음
        }
        
        try {
            await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP FOREIGN KEY \`FK_supplier_permits_buyer_id\``);
        } catch (e) {
            // 외래키가 없을 수 있음
        }
        
        try {
            await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP FOREIGN KEY \`FK_supplier_caps_owner_id\``);
        } catch (e) {
            // 외래키가 없을 수 있음
        }
        
        try {
            await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP FOREIGN KEY \`FK_supplier_caps_supplier_id\``);
        } catch (e) {
            // 외래키가 없을 수 있음
        }
        
        try {
            await queryRunner.query(`ALTER TABLE \`escrow_accounts\` DROP FOREIGN KEY \`FK_escrow_accounts_supplier_id\``);
        } catch (e) {
            // 외래키가 없을 수 있음
        }
        
        // 기존 컬럼 제거
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP COLUMN \`supplier_id\``);
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP COLUMN \`buyer_id\``);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP COLUMN \`owner_id\``);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP COLUMN \`supplier_id\``);
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` DROP COLUMN \`supplier_id\``);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // SupplierPermit 테이블 복원
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD \`supplier_id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD \`buyer_id\` int NULL`);
        
        // SupplierCap 테이블 복원
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD \`owner_id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD \`supplier_id\` int NOT NULL`);
        
        // EscrowAccount 테이블 복원
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` ADD \`supplier_id\` int NOT NULL`);
        
        // 데이터 복원 (간단한 예시)
        await queryRunner.query(`UPDATE \`supplier_permits\` SET \`supplier_id\` = 1`);
        await queryRunner.query(`UPDATE \`supplier_caps\` SET \`owner_id\` = 1, \`supplier_id\` = 1`);
        await queryRunner.query(`UPDATE \`escrow_accounts\` SET \`supplier_id\` = 1`);
        
        // 외래키 복원
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD CONSTRAINT \`FK_supplier_permits_supplier_id\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` ADD CONSTRAINT \`FK_supplier_permits_buyer_id\` FOREIGN KEY (\`buyer_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD CONSTRAINT \`FK_supplier_caps_owner_id\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` ADD CONSTRAINT \`FK_supplier_caps_supplier_id\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` ADD CONSTRAINT \`FK_escrow_accounts_supplier_id\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        
        // 새 컬럼 제거
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP COLUMN \`supplier_address\``);
        await queryRunner.query(`ALTER TABLE \`supplier_permits\` DROP COLUMN \`buyer_address\``);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP COLUMN \`owner_address\``);
        await queryRunner.query(`ALTER TABLE \`supplier_caps\` DROP COLUMN \`supplier_address\``);
        await queryRunner.query(`ALTER TABLE \`escrow_accounts\` DROP COLUMN \`supplier_address\``);
    }
}