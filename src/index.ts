import express from "express";
import dotenv from "dotenv";
import { json } from "express";
import cors from "cors";
import { walletRouter } from "./routes/wallet";
import { pointRouter } from "./routes/point";
import { authRouter } from "./routes/auth";
import { marketplaceRouter } from "./routes/marketplace";
import { redemptionRouter } from "./routes/redemption";
import { permitRouter } from "./routes/permit";
import { userRouter } from "./routes/user";
import debugRouter from "./routes/debug";
import walletUpgradeRouter from "./routes/wallet-upgrade";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { initDataSource } from "./db/data-source";
import { suiScheduler } from "./sui/scheduler";

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
      { name: "1️⃣ 사용자 관리", description: "사용자 프로필 및 계급 관리" },
      {
        name: "2️⃣ 쿠폰",
        description: "암호화된 오브젝트(cryptoObject) 생성 및 거래",
      },
      { name: "3️⃣ 포인트", description: "포인트 시스템 관리" },
      {
        name: "5️⃣ 거래 마켓플레이스",
        description: "오브젝트 거래 및 마켓플레이스",
      },
      { name: "6️⃣ 쿠폰 사용", description: "일회용 토큰 생성 및 쿠폰 사용" },
      { name: "7️⃣ Permit 관리", description: "Permit 상장/구매 및 Cap 발급" },
      {
        name: "Debug (개발용)",
        description: "개발/테스트 환경 전용 디버깅 API",
      },
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
app.use("/point", pointRouter);
app.use("/marketplace", marketplaceRouter);
app.use("/redemption", redemptionRouter);
app.use("/permit", permitRouter);
app.use("/user", userRouter);
app.use("/debug", debugRouter);
app.use("/wallet-upgrade", walletUpgradeRouter);

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

      // Sui 정기 동기화 시작 (10초마다)
      suiScheduler.start(10);
      console.log("🔄 Sui 정기 동기화 스케줄러 시작됨");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
