import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Coupon } from "../entities/Coupon";
import { CouponSale } from "../entities/CouponSale";
import { Point } from "../entities/Point";

const host = process.env.DB_HOST;
const port = +process.env.DB_PORT!;
const username = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

export const AppDataSource = new DataSource({
  type: "mariadb",
  host,
  port,
  username,
  password,
  database,
  entities: [User, Coupon, CouponSale, Point],
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
