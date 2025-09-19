import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("coupons")
export class Coupon {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  objectId!: string; // Sui object ID

  @Column({ type: "varchar", length: 100 })
  type!: string;

  @Column({ type: "bigint" })
  value!: string; // store as string to avoid JS bigint issues

  @Column({ type: "bigint" })
  expiryTimeMs!: string;

  @Column({ type: "boolean", default: false })
  used!: boolean;

  @Column({ type: "varchar", length: 200 })
  ownerAddress!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
