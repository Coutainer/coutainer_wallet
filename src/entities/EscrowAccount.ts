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
}
