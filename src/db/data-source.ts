import "reflect-metadata";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Point } from "../entities/Point";
import { IssuanceStamp } from "../entities/IssuanceStamp";
import { CouponObject } from "../entities/CouponObject";
import { EscrowAccount } from "../entities/EscrowAccount";
import { TradeTransaction } from "../entities/TradeTransaction";
import { SupplierPermit } from "../entities/SupplierPermit";
import { SupplierCap } from "../entities/SupplierCap";

// 환경변수 로드
dotenv.config();

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const username = process.env.DB_USER || "coupon_user";
const password = process.env.DB_PASSWORD || "coupon_pass";
const database = process.env.DB_NAME || "coupon_db";

export const AppDataSource = new DataSource({
  type: "mariadb",
  host,
  port,
  username,
  password,
  database,
  entities: [
    User,
    Point,
    IssuanceStamp,
    CouponObject,
    EscrowAccount,
    TradeTransaction,
    SupplierPermit,
    SupplierCap,
  ],
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  migrationsTableName: "migrations",
  synchronize: false, // 프로덕션에서는 false로 설정
  logging: process.env.NODE_ENV === "development",
  migrationsRun: false, // 자동 마이그레이션 실행 비활성화
});

export async function initDataSource(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}
