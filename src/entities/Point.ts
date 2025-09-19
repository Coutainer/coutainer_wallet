import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("points")
export class Point {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  userAddress!: string; // 사용자 주소

  @Column({ type: "bigint", default: "0" })
  balance!: string; // 포인트 잔액

  @Column({ type: "bigint", default: "0" })
  totalEarned!: string; // 총 획득 포인트

  @Column({ type: "bigint", default: "0" })
  totalSpent!: string; // 총 사용 포인트

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
