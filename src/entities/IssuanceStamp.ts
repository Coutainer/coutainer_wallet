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

@Entity("issuance_stamps")
export class IssuanceStamp {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "supplier_id" })
  supplier!: User;

  @Column({ name: "supplier_id" })
  supplierId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "issuer_id" })
  issuer!: User;

  @Column({ name: "issuer_id" })
  issuerId!: number;

  // 상품 정보
  @Column({ type: "varchar", length: 200 })
  title!: string; // 상품 제목

  @Column({ type: "text", nullable: true })
  description!: string | null; // 상품 설명

  @Column({ type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null; // 상품 이미지 URL

  @Column({ type: "int" })
  maxCount!: number; // 최대 발행 수량

  @Column({ type: "int" })
  issuedCount!: number; // 현재 발행 수량

  @Column({ type: "bigint" })
  faceValue!: string; // 쿠폰 1장당 가치 (포인트)

  @Column({ type: "bigint" })
  totalValue!: string; // 총 예치 금액

  @Column({ type: "bigint" })
  remainingValue!: string; // 남은 예치 금액

  @Column({ type: "datetime" })
  expiresAt!: Date; // 만료일

  @Column({ type: "boolean", default: true })
  isActive!: boolean; // 활성 상태

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
