import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertToWalletBased1758331000000 implements MigrationInterface {
    name = 'ConvertToWalletBased1758331000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // User 테이블에 zkLoginAddress 컬럼 추가
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`zk_login_address\` varchar(200) NULL`);
        
        // 기존 address를 zkLoginAddress로 이동
        await queryRunner.query(`UPDATE \`users\` SET \`zk_login_address\` = \`address\``);
        
        // hasWallet 기본값을 true로 변경
        await queryRunner.query(`ALTER TABLE \`users\` ALTER COLUMN \`has_wallet\` SET DEFAULT true`);
        
        // 기존 사용자들에게 새 지갑 주소 생성 (임시로 기존 주소 사용)
        // 실제로는 새 지갑을 생성해야 하지만, 마이그레이션에서는 기존 주소 유지
        // 나중에 애플리케이션에서 새 지갑 생성 로직 실행 필요
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // zkLoginAddress 컬럼 제거
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`zk_login_address\``);
        
        // hasWallet 기본값을 false로 복원
        await queryRunner.query(`ALTER TABLE \`users\` ALTER COLUMN \`has_wallet\` SET DEFAULT false`);
    }
}

