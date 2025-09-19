import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddPointEntity1726750000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "points",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "userAddress",
            type: "varchar",
            length: "200",
            isUnique: true,
          },
          {
            name: "balance",
            type: "bigint",
            default: "0",
          },
          {
            name: "totalEarned",
            type: "bigint",
            default: "0",
          },
          {
            name: "totalSpent",
            type: "bigint",
            default: "0",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "IDX_points_userAddress",
            columnNames: ["userAddress"],
            isUnique: true,
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("points");
  }
}
