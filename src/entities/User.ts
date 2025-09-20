import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum UserRole {
  CONSUMER = "CONSUMER", // 일반 사용자 (오브젝트 사용 가능)
  BUSINESS = "BUSINESS", // 비즈니스 계정 (공급자/발행자, 오브젝트 사용 불가)
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  address!: string; // Sui address

  @Column({ type: "varchar", length: 200, nullable: true })
  nickname!: string | null;

  @Column({ type: "text", nullable: true })
  mnemonic!: string | null; // 지갑 복구용 니모닉

  @Column({ type: "boolean", default: false })
  hasWallet!: boolean; // 지갑 생성 여부

  @Column({ type: "varchar", length: 50, nullable: true })
  salt!: string | null; // zkLogin용 salt

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.CONSUMER,
  })
  role!: UserRole; // 사용자 계급
}
