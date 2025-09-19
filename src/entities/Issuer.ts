import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("publishers")
export class Publisher {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  address!: string; // Sui address

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  website!: string | null;

  @Column({ type: "boolean", default: false })
  verified!: boolean;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "varchar", length: 200, nullable: true })
  verifiedBy!: string | null; // Admin address who verified

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
