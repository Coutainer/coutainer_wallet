import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";
import { CouponObject } from "./CouponObject";

@Entity("trade_transactions")
export class TradeTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "idempotency_key", type: "varchar", unique: true })
  idempotencyKey!: string; // 중복 방지 키

  @ManyToOne(() => CouponObject)
  @JoinColumn({ name: "object_id" })
  couponObject!: CouponObject;

  @Column({ name: "object_id" })
  objectId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "seller_id" })
  seller!: User;

  @Column({ name: "seller_id" })
  sellerId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "buyer_id" })
  buyer!: User;

  @Column({ name: "buyer_id" })
  buyerId!: number;

  @Column({ name: "price", type: "varchar" })
  price!: string; // 거래 가격

  @Column({ name: "supplier_fee", type: "varchar" })
  supplierFee!: string; // 공급자 수수료 (3%)

  @Column({ name: "remaining_after_trade", type: "varchar" })
  remainingAfterTrade!: string; // 거래 후 remaining

  @Index()
  @Column({ name: "processed_at", type: "datetime" })
  processedAt!: Date; // 처리 시간
}
