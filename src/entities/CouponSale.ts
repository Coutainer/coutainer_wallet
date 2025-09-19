import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("coupon_sales")
export class CouponSale {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 200 })
  couponObjectId!: string;

  @Column({ type: "varchar", length: 200 })
  sellerAddress!: string;

  @Column({ type: "bigint" })
  priceMist!: string; // price in MIST

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
