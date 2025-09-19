import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
