import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

export enum PermitStatus {
  LISTED = "LISTED", // Kiosk에 상장됨
  SOLD = "SOLD", // 발행자가 구매함
  REDEEMED = "REDEEMED", // Cap으로 교환됨
  EXPIRED = "EXPIRED", // 만료됨
  CANCELLED = "CANCELLED", // 취소됨
}

@Entity("supplier_permits")
export class SupplierPermit {
  @PrimaryGeneratedColumn()
  id!: number;

  // 공급자 정보
  @ManyToOne(() => User)
  @JoinColumn({ name: "supplier_id" })
  supplier!: User;

  @Column({ name: "supplier_id" })
  supplierId!: number;

  // 구매자 정보 (발행자)
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "buyer_id" })
  buyer?: User;

  @Column({ name: "buyer_id", nullable: true })
  buyerId?: number;

  // 상품 정보
  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string; // 상품 제목

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null; // 상품 설명

  @Column({ name: "image_url", type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null; // 상품 이미지 URL

  // 권한 정보
  @Column({ name: "scope", type: "varchar", length: 100 })
  scope!: string; // 권한 범위 (예: "COUPON_ISSUANCE")

  @Column({ name: "limit", type: "bigint" })
  limit!: string; // 최대 발행 수량

  @Column({ name: "face_value", type: "bigint" })
  faceValue!: string; // 오브젝트 1개당 발행 당시 가격 (포인트)

  @Column({ name: "total_value", type: "bigint" })
  totalValue!: string; // 총 발행 가능한 가치 (limit * faceValue)

  @Column({ name: "price", type: "bigint" })
  price!: string; // Permit 구매 가격 (포인트)

  // 만료 정보
  @Column({ name: "expiry", type: "datetime" })
  expiry!: Date; // Permit 만료일

  // 상태 관리
  @Column({
    name: "status",
    type: "enum",
    enum: PermitStatus,
    default: PermitStatus.LISTED,
  })
  status!: PermitStatus;

  // 서명 정보
  @Column({ name: "signature", type: "varchar", length: 500, nullable: true })
  signature!: string | null; // 공급자 서명

  @Column({ name: "nonce", type: "varchar", length: 100, nullable: true })
  nonce!: string | null; // 중복 방지 nonce

  // 거래 정보
  @Column({ name: "sold_at", type: "datetime", nullable: true })
  soldAt!: Date | null; // 구매일

  @Column({ name: "redeemed_at", type: "datetime", nullable: true })
  redeemedAt!: Date | null; // Cap 교환일
}
