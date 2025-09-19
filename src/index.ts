import express from "express";
import dotenv from "dotenv";
import { json } from "express";
import cors from "cors";
import { walletRouter } from "./routes/wallet";
import { moveRouter } from "./routes/move";
import { dbRouter } from "./routes/db";
import { couponRouter } from "./routes/coupon";
import { pointRouter } from "./routes/point";
import { authRouter } from "./routes/auth";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { initDataSource } from "./db/data-source";

dotenv.config();

const app = express();

// CORS 전체 허용
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "auth"],
  })
);

app.use(json());

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Coutainer - 디지털 쿠폰 플랫폼",
      version: "1.0.0",
      description: `
# Coutainer - 디지털 쿠폰 플랫폼

## 📋 간단한 사용자 간 쿠폰 거래 시스템

### 1️⃣ 로그인 및 지갑
- OIDC 기반 로그인으로 계정 생성/로그인
- Sui 지갑 생성 및 관리

### 2️⃣ 암호화된 오브젝트 생성 및 거래
- 사용자가 암호화된 오브젝트(cryptoObject) 생성
- 사용자 간 암호화된 오브젝트 거래 (SUI ↔ cryptoObject)
- 원클릭 SUI와 cryptoObject 교환
- cryptoObject를 실제 디지털 쿠폰으로 디코딩

## 🏗️ 기술 스택
- **Backend**: Node.js + Express + TypeScript
- **Blockchain**: Sui Move 스마트 컨트랙트
- **Database**: MySQL + TypeORM
- **Authentication**: OIDC (Google 등)
      `,
    },
    tags: [
      { name: "1️⃣ 인증", description: "로그인 및 계정 관리" },
      { name: "1️⃣ 지갑", description: "Sui 지갑 생성 및 관리" },
      {
        name: "2️⃣ 쿠폰",
        description: "암호화된 오브젝트(cryptoObject) 생성 및 거래",
      },
      { name: "포인트", description: "포인트 시스템 관리" },
      { name: "Move", description: "Sui Move 스마트 컨트랙트 호출" },
      { name: "데이터베이스", description: "DB 상태 확인" },
    ],
    servers: [
      {
        url: process.env.SWAGGER_SERVER_URL || "http://localhost:3000",
        description: "개발 서버",
      },
    ],
  },
  apis: [__dirname + "/routes/*.ts"],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/wallet", walletRouter);
app.use("/coupon", couponRouter);
app.use("/point", pointRouter);
app.use("/move", moveRouter);
app.use("/db", dbRouter);

const port = Number(process.env.PORT || 3000);

async function startServer() {
  try {
    // 데이터베이스 초기화
    await initDataSource();
    console.log("✅ Database connected successfully");

    // 서버 시작
    app.listen(port, () => {
      console.log(`🚀 Server listening on http://localhost:${port}`);
      console.log(`📚 API docs available at http://localhost:${port}/docs`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
