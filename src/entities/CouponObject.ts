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
import { IssuanceStamp } from "./IssuanceStamp";

export enum CouponObjectState {
  CREATED = "CREATED",
  TRANSFERRED = "TRANSFERRED",
  REDEEMED = "REDEEMED",
  EXPIRED = "EXPIRED",
}

@Entity("coupon_objects")
export class CouponObject {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100, unique: true })
  couponId!: string; // 쿠폰 고유 ID

  // 소유자 정보
  @ManyToOne(() => User)
  @JoinColumn({ name: "owner_id" })
  owner!: User;

  @Column({ name: "owner_id" })
  ownerId!: number;

  // 발행 권한 도장
  @ManyToOne(() => IssuanceStamp)
  @JoinColumn({ name: "stamp_id" })
  stamp!: IssuanceStamp;

  @Column({ name: "stamp_id" })
  stampId!: number;

  // 공급자 정보
  @ManyToOne(() => User)
  @JoinColumn({ name: "supplier_id" })
  supplier!: User;

  @Column({ name: "supplier_id" })
  supplierId!: number;

  // 발행자 정보
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

  // 가격 및 가치 정보
  @Column({ type: "bigint" })
  faceValue!: string; // 발행 당시 가격 (포인트)

  @Column({ type: "bigint" })
  remaining!: string; // 남은 가치

  @Column({ type: "int", default: 0 })
  tradeCount!: number; // 거래 횟수

  // 상태 및 만료 정보
  @Column({
    type: "enum",
    enum: CouponObjectState,
    default: CouponObjectState.CREATED,
  })
  state!: CouponObjectState;

  @Column({ type: "datetime" })
  expiration!: Date; // 사용 만료일

  @Column({ type: "datetime" })
  issuedAt!: Date; // 발행일

  // 일회용 토큰 정보 (사용 시)
  @Index()
  @Column({ type: "varchar", length: 100, nullable: true })
  jti!: string | null; // 일회용 토큰 ID

  @Column({ type: "datetime", nullable: true })
  usedAt!: Date | null; // 사용일

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
