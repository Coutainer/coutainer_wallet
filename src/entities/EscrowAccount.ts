import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("escrow_accounts")
export class EscrowAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "supplier_address", type: "varchar", length: 100 })
  supplierAddress!: string;

  @Column({ type: "bigint", default: "0" })
  balance!: string; // 예치된 포인트

  @Column({ type: "bigint", default: "0" })
  totalDeposited!: string; // 총 예치 금액

  @Column({ type: "bigint", default: "0" })
  totalReleased!: string; // 총 지급 금액
}
