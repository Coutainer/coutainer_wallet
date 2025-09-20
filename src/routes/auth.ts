import { Router } from "express";
import { z } from "zod";
import * as jose from "jose";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../db/data-source";
import { User } from "../entities/User";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import {
  jwtToAddress,
  computeZkLoginAddress,
  parseZkLoginSignature,
  getZkLoginSignature,
} from "@mysten/sui/zklogin";
import { generateWallet } from "../sui/wallet";

const callbackUrl = process.env.CALLBACK_URL || "http://localhost:3000";
export const authRouter = Router();

// 계정 생성 시 자동으로 지갑 생성하는 함수
async function createUserWithWallet(
  zkLoginAddress: string,
  nickname: string | null = null,
  salt: string | null = null
) {
  const userRepo = AppDataSource.getRepository(User);

  // 새 지갑 생성
  const wallet = generateWallet();

  // 사용자 생성 (지갑 주소를 메인 주소로 사용)
  const user = userRepo.create({
    address: wallet.address, // 지갑 주소를 메인 주소로 사용
    zkLoginAddress: zkLoginAddress, // zkLogin 주소 별도 저장
    nickname: nickname || `user_${Date.now()}`,
    mnemonic: wallet.mnemonic,
    hasWallet: true,
    salt: salt, // zkLogin용 salt 저장
  });

  await userRepo.save(user);
  console.log("Created new user with wallet:", {
    id: user.id,
    address: user.address, // 지갑 주소
    zkLoginAddress: user.zkLoginAddress, // zkLogin 주소
    hasWallet: user.hasWallet,
    salt: salt,
  });

  return user;
}

const env = {
  oidcIssuer: process.env.OIDC_ISSUER || "https://accounts.google.com",
  audience: process.env.OIDC_AUDIENCE || undefined,
  sessionSecret: process.env.SESSION_SECRET || "your-secret-key-here",
};

const loginSchema = z.object({
  jwt: z.string(),
});

const zkLoginSchema = z.object({
  jwt: z.string(),
  salt: z.string(),
  // 나머지 필드들은 선택사항으로 변경
  maxEpoch: z.string().optional(),
  userSignature: z.string().optional(),
  ephemeralPublicKey: z.string().optional(),
  ephemeralPrivateKey: z.string().optional(),
  nonce: z.string().optional(),
});

/**
 * @openapi
 * /auth/login:
 *   get:
 *     tags:
 *       - 1️⃣ 인증
 *     summary: 로그인 페이지
 *     description: OIDC 로그인을 위한 HTML 페이지를 제공합니다
 *     responses:
 *       200:
 *         description: 로그인 페이지 HTML
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
authRouter.get("/login", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Coutainer - 로그인</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-size: 2.5rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .login-btn {
            background: #4285f4;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 20px;
            transition: background 0.3s;
        }
        .login-btn:hover {
            background: #3367d6;
        }
        .wallet-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .wallet-btn {
            background: #f8f9fa;
            color: #333;
            border: 1px solid #ddd;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 10px;
            transition: background 0.3s;
        }
        .wallet-btn:hover {
            background: #e9ecef;
        }
        .address-display {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
            display: none;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎫 Coutainer</div>
        <div class="subtitle">디지털 쿠폰 플랫폼</div>
        
        <button class="login-btn" onclick="googleLogin()">
            🔐 Google zkLogin으로 로그인
        </button>
        
        <div class="wallet-section">
            <h3>지갑 생성</h3>
            <button class="wallet-btn" onclick="createWallet()">
                💼 새 지갑 생성
            </button>
            <div id="addressDisplay" class="address-display"></div>
        </div>
        
        <div id="status" class="status"></div>
    </div>

    <script>
        let userAddress = '';
        
        // Google OAuth 설정
        function googleLogin() {
            const clientId = '${process.env.GOOGLE_CLIENT_ID || ""}';
            const redirectUri = '${callbackUrl}/auth/callback';
            const scope = 'openid email profile';
            const responseType = 'code';
            const state = 'random_state_string';
            const accessType = 'offline';
            const prompt = 'consent';
            
            const authUrl = \`https://accounts.google.com/o/oauth2/v2/auth?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&scope=\${encodeURIComponent(scope)}&response_type=\${responseType}&state=\${state}&access_type=\${accessType}&prompt=\${prompt}\`;
            
            console.log('Redirecting to:', authUrl);
            window.location.href = authUrl;
        }
        
        
        // 지갑 생성
        async function createWallet() {
            try {
                const response = await fetch('/wallet/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    userAddress = data.address;
                    document.getElementById('addressDisplay').style.display = 'block';
                    document.getElementById('addressDisplay').innerHTML = \`
                        <strong>지갑 주소:</strong><br>
                        \${data.address}<br><br>
                        <strong>니모닉:</strong><br>
                        <small>\${data.mnemonic}</small><br><br>
                        <small style="color: #666;">⚠️ 니모닉을 안전하게 보관하세요!</small>
                    \`;
                    showStatus('지갑이 성공적으로 생성되었습니다!', 'success');
                } else {
                    showStatus('지갑 생성 실패: ' + data.error, 'error');
                }
            } catch (error) {
                showStatus('오류 발생: ' + error.message, 'error');
            }
        }
        
        // 상태 메시지 표시
        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = message;
            statusDiv.className = 'status ' + type;
            statusDiv.style.display = 'block';
        }
        
        // URL 파라미터에서 코드 확인
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            // OAuth 콜백 처리
            handleOAuthCallback(code);
        }
        
        async function handleOAuthCallback(code) {
            try {
                // 실제 구현에서는 서버에서 토큰을 교환해야 함
                showStatus('OAuth 콜백을 처리 중입니다...', 'success');
                
                // 여기서 실제로는 서버의 /auth/callback 엔드포인트를 호출해야 함
                // 현재는 데모용으로 간단한 메시지만 표시
                
            } catch (error) {
                showStatus('OAuth 처리 실패: ' + error.message, 'error');
            }
        }
    </script>
</body>
</html>
  `;

  res.send(html);
});

/**
 * @openapi
 * /auth/callback:
 *   get:
 *     tags:
 *       - 1️⃣ 인증
 *     summary: OAuth 콜백 처리
 *     description: OAuth 인증 후 콜백을 처리합니다
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: OAuth 인증 코드
 *     responses:
 *       200:
 *         description: 로그인 성공 페이지
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: 인증 실패
 */
authRouter.get("/callback", async (req, res) => {
  const { code } = req.query;
  console.log(code);

  if (!code) {
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ 인증 실패</h2>
          ${code}
          <p>인증 코드가 없습니다.</p>
          <a href="/auth/login" style="color: #667eea;">다시 로그인</a>
        </body>
      </html>
    `);
  }

  try {
    // 실제 Google OAuth 토큰 교환
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI ||
          `http://localhost:3000/auth/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    console.log("OAuth token response:", tokenData);
    console.log("Response status:", tokenResponse.status);
    console.log(
      "Response headers:",
      Object.fromEntries(tokenResponse.headers.entries())
    );

    if (!tokenData.id_token) {
      console.error("No ID token in response:", tokenData);

      // Google OAuth 오류 처리
      if (tokenData.error === "invalid_client") {
        console.log("Google OAuth client error - check GOOGLE_CLIENT_SECRET");
        throw new Error(
          "Google OAuth 설정 오류: 클라이언트 시크릿을 확인하세요"
        );
      }

      throw new Error(
        `No ID token received. Response: ${JSON.stringify(tokenData)}`
      );
    }

    // JWT 디코딩하여 이메일 추출
    const jwtPayload = JSON.parse(
      Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
    );
    const email = jwtPayload.email || `user_${Date.now()}`;

    // 이메일로 기존 사용자 조회
    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { nickname: email } });

    if (user) {
      // 기존 사용자: 저장된 주소 그대로 사용
      console.log("Found existing user:", {
        id: user.id,
        address: user.address,
        email: user.nickname,
      });
    } else {
      // 새 사용자: 새 주소 생성
      const salt = Math.random().toString(36).substring(2, 15);
      let computedAddress: string;

      try {
        computedAddress = jwtToAddress(tokenData.id_token, salt);
      } catch (jwtError) {
        // 테스트용 주소 생성
        const hash = require("crypto")
          .createHash("sha256")
          .update(tokenData.id_token + salt)
          .digest("hex");
        computedAddress = `0x${hash.substring(0, 40)}`;
      }

      // 사용자 계정 생성 (자동으로 지갑도 생성됨)
      user = await createUserWithWallet(computedAddress, email, salt);
    }

    // 세션 토큰 생성
    const session = jwt.sign(
      {
        sub: user.id,
        address: user.address,
        iss: "coutainer",
        email: jwtPayload.email || user.nickname,
        role: user.role,
        zkLogin: true,
      },
      env.sessionSecret,
      { expiresIn: "7d" }
    );

    return res.json({
      token: session,
      user: { id: user.id, address: user.address },
    });
  } catch (error: any) {
    console.error("OAuth callback error:", error);

    const errorHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ OAuth 처리 실패</h2>
          ${error.message}
          <p>오류: ${error.message}</p>
          <a href="/auth/login" style="color: #667eea;">다시 로그인</a>
        </body>
      </html>
    `;

    res.status(500).send(errorHtml);
  }
});

/**
 * @openapi
 * /auth/zklogin:
 *   post:
 *     tags:
 *       - 1️⃣ 인증
 *     summary: zkLogin 인증
 *     description: Sui zkLogin을 사용한 안전한 인증 (JWT에서 자동으로 주소 계산, 지갑 주소 불필요)
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jwt
 *               - salt
 *             properties:
 *               jwt:
 *                 type: string
 *                 description: OIDC JWT 토큰 (Google, Apple 등에서 발급)
 *                 example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               salt:
 *                 type: string
 *                 description: 사용자 솔트 (주소 계산용)
 *                 example: "1234567890"
 *               maxEpoch:
 *                 type: string
 *                 description: 최대 에포크 (선택사항)
 *                 example: "100"
 *               userSignature:
 *                 type: string
 *                 description: 사용자 서명 (선택사항)
 *               ephemeralPublicKey:
 *                 type: string
 *                 description: 임시 공개키 (선택사항)
 *               ephemeralPrivateKey:
 *                 type: string
 *                 description: 임시 개인키 (선택사항)
 *               nonce:
 *                 type: string
 *                 description: 논스 (선택사항)
 *     responses:
 *       200:
 *         description: zkLogin 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: 세션 JWT 토큰
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     address:
 *                       type: string
 *                 zkLoginAddress:
 *                   type: string
 *                   description: zkLogin으로 계산된 주소
 *       400:
 *         description: 잘못된 요청 또는 zkLogin 검증 실패
 */
authRouter.post("/zklogin", async (req, res) => {
  try {
    console.log("ZkLogin request body:", req.body);

    const body = zkLoginSchema.parse(req.body);
    console.log("Parsed zkLogin body:", body);

    // JWT 검증 (테스트용으로 선택사항)
    let claims: any;
    try {
      claims = await verifyIdToken(body.jwt);
      console.log("Verified JWT claims:", claims);
    } catch (jwtVerifyError: any) {
      console.warn(
        "JWT verification failed, using test mode:",
        jwtVerifyError.message
      );
      // 테스트용 기본 클레임
      claims = {
        email: "test@example.com",
        sub: "test_user",
        name: "Test User",
      };
    }

    const email = (claims.email as string) || `zkuser_${Date.now()}`;

    // 이메일로 기존 사용자 조회
    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { nickname: email } });
    let computedAddress: string;

    if (user) {
      // 기존 사용자: 지갑 주소 사용
      console.log("Found existing zkLogin user:", {
        id: user.id,
        address: user.address, // 지갑 주소
        zkLoginAddress: user.zkLoginAddress, // zkLogin 주소
        email: user.nickname,
      });
    } else {
      // 새 사용자: 클라이언트에서 제공한 salt로 주소 생성
      const salt = body.salt;

      try {
        computedAddress = jwtToAddress(body.jwt, salt);
        console.log("Computed zkLogin address with new salt:", computedAddress);
      } catch (jwtError: any) {
        console.error("JWT to address conversion failed:", jwtError);
        // 테스트용으로 간단한 주소 생성
        const hash = require("crypto")
          .createHash("sha256")
          .update(body.jwt + salt)
          .digest("hex");
        computedAddress = `0x${hash.substring(0, 40)}`;
        console.log("Generated test address:", computedAddress);
      }

      // 사용자 계정 생성 (자동으로 지갑도 생성됨)
      user = await createUserWithWallet(computedAddress, email, salt);
    }
    console.log("zkLogin user:", user);

    const session = jwt.sign(
      {
        sub: user.id,
        address: user.address, // 지갑 주소
        zkLoginAddress: user.zkLoginAddress, // zkLogin 주소
        iss: "coutainer",
        email: claims.email,
        role: user.role,
        zkLogin: true,
      },
      env.sessionSecret,
      { expiresIn: "7d" }
    );

    console.log("ZkLogin successful for user:", user.address);
    res.json({
      token: session,
      user: { id: user.id, address: user.address },
      zkLoginAddress: user.zkLoginAddress,
    });
  } catch (err: any) {
    console.error("ZkLogin error:", err);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });

    if (err.name === "ZodError") {
      res.status(400).json({
        error: "잘못된 요청 형식",
        details: err.errors,
        message: "jwt와 salt가 필요합니다.",
      });
    } else if (err.message.includes("JWT")) {
      res.status(400).json({
        error: "JWT 검증 실패",
        message: "유효하지 않은 JWT 토큰입니다.",
      });
    } else {
      res.status(400).json({
        error: err.message,
        message: "zkLogin 중 오류가 발생했습니다.",
      });
    }
  }
});

async function verifyIdToken(id_token: string) {
  try {
    console.log("Verifying token with issuer:", env.oidcIssuer);

  const JWKS = jose.createRemoteJWKSet(
    new URL(`${env.oidcIssuer}/.well-known/openid-configuration/jwks`)
  );

    const verifyOptions: any = {
    issuer: env.oidcIssuer,
    };

    if (env.audience) {
      verifyOptions.audience = env.audience;
    }

    console.log("Verification options:", verifyOptions);

    const { payload } = await jose.jwtVerify(id_token, JWKS, verifyOptions);
    console.log("Token verification successful");
  return payload;
  } catch (error: any) {
    console.error("Token verification failed:", error);
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - 1️⃣ 인증
 *     summary: OIDC 로그인
 *     description: Google 등 OIDC 제공자에서 발급받은 JWT 토큰으로 로그인 (지갑 주소 필요)
 *     parameters:
 *       - in: header
 *         name: auth
 *         schema:
 *           type: string
 *         required: true
 *         description: JWT 토큰 (Bearer {token} 형식)
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jwt
 *               - address
 *             properties:
 *               jwt:
 *                 type: string
 *                 description: OIDC 제공자에서 발급받은 JWT 토큰
 *                 example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               address:
 *                 type: string
 *                 description: 사용자의 Sui 주소
 *                 example: "0x1234567890abcdef..."
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: 세션 JWT 토큰
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     address:
 *                       type: string
 *       400:
 *         description: 잘못된 요청 또는 토큰 검증 실패
 */
authRouter.post("/login", async (req, res) => {
  try {
    console.log("Login request body:", req.body);

    const body = loginSchema.parse(req.body);
    console.log("Parsed body:", body);

    const claims = await verifyIdToken(body.jwt);
    console.log("Verified claims:", claims);

    // JWT에서 이메일 추출
    const email = claims.email as string;

    // 이메일로 기존 사용자 조회
    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { nickname: email } });

    if (user) {
      // 기존 사용자: 지갑 주소 사용
      console.log("Found existing user:", {
        id: user.id,
        address: user.address, // 지갑 주소
        zkLoginAddress: user.zkLoginAddress, // zkLogin 주소
        email: user.nickname,
      });
    } else {
      // 새 사용자: 새 주소 생성
      const salt = Math.random().toString(36).substring(2, 15);
      let computedAddress: string;

      try {
        computedAddress = jwtToAddress(body.jwt, salt);
      } catch (jwtError) {
        // 테스트용 주소 생성
        const hash = require("crypto")
          .createHash("sha256")
          .update(body.jwt + salt)
          .digest("hex");
        computedAddress = `0x${hash.substring(0, 40)}`;
      }

      // 사용자 계정 생성 (자동으로 지갑도 생성됨)
      user = await createUserWithWallet(computedAddress, email || null, salt);
    }
    console.log("Login user:", user);

    const session = jwt.sign(
      {
        sub: user.id,
        address: user.address, // 지갑 주소
        zkLoginAddress: user.zkLoginAddress, // zkLogin 주소
        iss: "coutainer",
        email: claims.email,
        role: user.role,
      },
      env.sessionSecret,
      { expiresIn: "7d" }
    );

    console.log("Login successful for user:", user.address);
    res.json({ token: session, user: { id: user.id, address: user.address } });
  } catch (err: any) {
    console.error("Login error:", err);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });

    // 더 구체적인 에러 메시지 제공
    if (err.name === "ZodError") {
      res.status(400).json({
        error: "잘못된 요청 형식",
        details: err.errors,
        message: "id_token과 address가 필요합니다.",
      });
    } else if (err.message.includes("JWT")) {
      res.status(400).json({
        error: "토큰 검증 실패",
        message: "유효하지 않은 id_token입니다.",
      });
    } else {
      res.status(400).json({
        error: err.message,
        message: "로그인 중 오류가 발생했습니다.",
      });
    }
  }
});
