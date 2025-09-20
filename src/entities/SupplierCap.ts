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
import { SupplierPermit } from "./SupplierPermit";

export enum CapStatus {
  ACTIVE = "ACTIVE", // 활성
  FROZEN = "FROZEN", // 정지됨
  EXPIRED = "EXPIRED", // 만료됨
  EXHAUSTED = "EXHAUSTED", // 소진됨
}

@Entity("supplier_caps")
export class SupplierCap {
  @PrimaryGeneratedColumn()
  id!: number;

  // Permit 정보
  @ManyToOne(() => SupplierPermit)
  @JoinColumn({ name: "permit_id" })
  permit!: SupplierPermit;

  @Column({ name: "permit_id" })
  permitId!: number;

  // 소유자 정보 (발행자)
  @ManyToOne(() => User)
  @JoinColumn({ name: "owner_id" })
  owner!: User;

  @Column({ name: "owner_id" })
  ownerId!: number;

  // 공급자 정보
  @ManyToOne(() => User)
  @JoinColumn({ name: "supplier_id" })
  supplier!: User;

  @Column({ name: "supplier_id" })
  supplierId!: number;

  // 권한 정보
  @Column({ name: "scope", type: "varchar", length: 100 })
  scope!: string; // 권한 범위

  @Column({ name: "remaining", type: "bigint" })
  remaining!: string; // 남은 발행 가능 수량

  @Column({ name: "original_limit", type: "bigint" })
  originalLimit!: string; // 원래 발행 가능 수량

  @Column({ name: "face_value", type: "bigint" })
  faceValue!: string; // 오브젝트 1개당 발행 당시 가격 (포인트)

  // 상품 정보
  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string; // 상품 제목

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null; // 상품 설명

  @Column({ name: "image_url", type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null; // 상품 이미지 URL

  // 만료 정보
  @Column({ name: "expiry", type: "datetime" })
  expiry!: Date; // Cap 만료일

  // 상태 관리
  @Column({
    name: "status",
    type: "enum",
    enum: CapStatus,
    default: CapStatus.ACTIVE,
  })
  status!: CapStatus;

  @Column({ name: "frozen", type: "boolean", default: false })
  frozen!: boolean; // 정지 여부

  // 사용 통계
  @Column({ name: "issued_count", type: "int", default: 0 })
  issuedCount!: number; // 실제 발행된 수량

  @Column({ name: "total_value_issued", type: "bigint", default: "0" })
  totalValueIssued!: string; // 총 발행된 가치
}
