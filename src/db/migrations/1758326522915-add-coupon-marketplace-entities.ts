import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCouponMarketplaceEntities1758326522915 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 발행 권한 도장 테이블 생성
        await queryRunner.query(`CREATE TABLE \`issuance_stamps\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`supplier_id\` int NOT NULL,
            \`issuer_id\` int NOT NULL,
            \`title\` varchar(200) NOT NULL,
            \`description\` text,
            \`image_url\` varchar(500),
            \`max_count\` int NOT NULL,
            \`issued_count\` int NOT NULL,
            \`face_value\` varchar(255) NOT NULL,
            \`total_value\` varchar(255) NOT NULL,
            \`remaining_value\` varchar(255) NOT NULL,
            \`expires_at\` datetime NOT NULL,
            \`is_active\` tinyint NOT NULL DEFAULT 1,
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            KEY \`FK_issuance_stamps_supplier\` (\`supplier_id\`),
            KEY \`FK_issuance_stamps_issuer\` (\`issuer_id\`),
            CONSTRAINT \`FK_issuance_stamps_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_issuance_stamps_issuer\` FOREIGN KEY (\`issuer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);

        // Escrow 계정 테이블 생성
        await queryRunner.query(`CREATE TABLE \`escrow_accounts\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`supplier_id\` int NOT NULL,
            \`balance\` varchar(255) NOT NULL DEFAULT '0',
            \`total_deposited\` varchar(255) NOT NULL DEFAULT '0',
            \`total_released\` varchar(255) NOT NULL DEFAULT '0',
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_escrow_supplier\` (\`supplier_id\`),
            KEY \`FK_escrow_accounts_supplier\` (\`supplier_id\`),
            CONSTRAINT \`FK_escrow_accounts_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);

        // 쿠폰 오브젝트 테이블 생성
        await queryRunner.query(`CREATE TABLE \`coupon_objects\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`coupon_id\` varchar(100) NOT NULL,
            \`owner_id\` int NOT NULL,
            \`stamp_id\` int NOT NULL,
            \`supplier_id\` int NOT NULL,
            \`issuer_id\` int NOT NULL,
            \`title\` varchar(200) NOT NULL,
            \`description\` text,
            \`image_url\` varchar(500),
            \`face_value\` varchar(255) NOT NULL,
            \`remaining\` varchar(255) NOT NULL,
            \`trade_count\` int NOT NULL DEFAULT 0,
            \`state\` enum('CREATED', 'TRANSFERRED', 'REDEEMED', 'EXPIRED') NOT NULL DEFAULT 'CREATED',
            \`expiration\` datetime NOT NULL,
            \`issued_at\` datetime NOT NULL,
            \`jti\` varchar(100),
            \`used_at\` datetime,
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_coupon_id\` (\`coupon_id\`),
            KEY \`IDX_coupon_objects_jti\` (\`jti\`),
            KEY \`FK_coupon_objects_owner\` (\`owner_id\`),
            KEY \`FK_coupon_objects_stamp\` (\`stamp_id\`),
            KEY \`FK_coupon_objects_supplier\` (\`supplier_id\`),
            KEY \`FK_coupon_objects_issuer\` (\`issuer_id\`),
            CONSTRAINT \`FK_coupon_objects_owner\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_coupon_objects_stamp\` FOREIGN KEY (\`stamp_id\`) REFERENCES \`issuance_stamps\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_coupon_objects_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_coupon_objects_issuer\` FOREIGN KEY (\`issuer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);

        // 거래 트랜잭션 테이블 생성
        await queryRunner.query(`CREATE TABLE \`trade_transactions\` (
            \`id\` int NOT NULL AUTO_INCREMENT,
            \`idempotency_key\` varchar(100) NOT NULL,
            \`object_id\` int NOT NULL,
            \`seller_id\` int NOT NULL,
            \`buyer_id\` int NOT NULL,
            \`price\` varchar(255) NOT NULL,
            \`supplier_fee\` varchar(255) NOT NULL,
            \`remaining_after_trade\` varchar(255) NOT NULL,
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`processed_at\` datetime NOT NULL,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`UQ_trade_idempotency\` (\`idempotency_key\`),
            KEY \`IDX_trade_processed_at\` (\`processed_at\`),
            KEY \`FK_trade_transactions_object\` (\`object_id\`),
            KEY \`FK_trade_transactions_seller\` (\`seller_id\`),
            KEY \`FK_trade_transactions_buyer\` (\`buyer_id\`),
            CONSTRAINT \`FK_trade_transactions_object\` FOREIGN KEY (\`object_id\`) REFERENCES \`coupon_objects\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_trade_transactions_seller\` FOREIGN KEY (\`seller_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT \`FK_trade_transactions_buyer\` FOREIGN KEY (\`buyer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`trade_transactions\``);
        await queryRunner.query(`DROP TABLE \`coupon_objects\``);
        await queryRunner.query(`DROP TABLE \`escrow_accounts\``);
        await queryRunner.query(`DROP TABLE \`issuance_stamps\``);
    }

}
