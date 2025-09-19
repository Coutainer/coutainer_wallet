## Coutainer - 디지털 쿠폰 플랫폼

사용자 간 암호화된 오브젝트(cryptoObject) 거래를 위한 Express + TypeScript 서버입니다. Sui 블록체인을 기반으로 한 포인트 시스템과 쿠폰 거래 기능을 제공합니다.

### 준비물

- Node.js 18+
- Sui CLI (선택) – Move 패키지 배포에 필요: `brew install sui` 또는 공식 문서 참고

### 설치

```bash
npm install
```

환경변수 설정: `.env` 파일 생성

```bash
# env.example 파일을 복사하여 .env 파일 생성
cp env.example .env
```

`.env` 파일에서 다음 값들을 실제 값으로 변경하세요:

```bash
# 서버 설정
PORT=3000
CALLBACK_URL=http://localhost:3000

# JWT 세션 시크릿 (보안상 중요!)
SESSION_SECRET=your-secret-key-here

# Google OAuth 설정 (Google Cloud Console에서 발급)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# OIDC 설정 (선택사항)
OIDC_ISSUER=https://accounts.google.com
OIDC_AUDIENCE=

# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
```

**⚠️ 보안 주의사항:**

- `SESSION_SECRET`은 반드시 강력한 랜덤 문자열로 변경하세요
- `GOOGLE_CLIENT_SECRET`은 절대 공개하지 마세요
- `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다

### 실행

```bash
npm run dev
# http://localhost:3000/health
```

### 데이터베이스 마이그레이션

#### 개발 환경

```bash
# 마이그레이션 실행
npm run db:migrate

# 마이그레이션 상태 확인
npm run db:status

# 마이그레이션 되돌리기
npm run db:revert

# 새 마이그레이션 생성
npm run db:create -- -n MigrationName
```

#### 프로덕션 환경

```bash
# 빌드 후 마이그레이션 실행
npm run build
npm run migrate:prod

# 또는 Docker 환경에서
./scripts/docker-migrate.sh
```

#### Docker Compose 배포

```bash
# 1. 데이터베이스 마이그레이션 실행
docker-compose run --rm app npm run migrate:prod

# 2. 애플리케이션 시작
docker-compose up -d
```

### 주요 기능

#### 1️⃣ 인증 및 지갑

- **Google OAuth + zkLogin 기반 자동 회원가입/로그인**
- **계정 생성 시 자동 지갑 생성 및 연결**
- Sui 지갑 관리 및 잔액 조회
- SUI 전송 기능

#### 2️⃣ 암호화된 오브젝트(cryptoObject) 거래

- cryptoObject 생성 및 판매 등록
- SUI 또는 포인트로 cryptoObject 구매
- 사용자 간 cryptoObject 거래
- cryptoObject를 실제 디지털 쿠폰으로 디코딩

#### 3️⃣ 포인트 시스템

- **포인트 잔액 조회**
- **포인트 충전** (외부 API 연동 없음)

### 🔐 인증 시스템

#### OIDC 기반 자동 회원가입/로그인

이 플랫폼은 **별도의 회원가입 과정 없이** OIDC 표준을 사용하여 자동으로 계정을 생성합니다.

#### zkLogin 지원 (권장)

[Sui zkLogin](https://sdk.mystenlabs.com/typescript/zklogin)을 사용하여 더욱 안전하고 표준적인 인증을 제공합니다:

- **🔒 보안성**: JWT에서 자동으로 주소를 계산하여 주소 조작 방지
- **🌐 표준 준수**: Sui 생태계의 표준 인증 방식
- **⚡ 효율성**: Zero-knowledge proof를 통한 빠른 인증
- **🔄 호환성**: 기존 OIDC 제공자와 완벽 호환
- **💡 간편성**: **지갑 주소 불필요** - JWT와 솔트만으로 인증

**사용 과정:**

#### Google OAuth + zkLogin:

1. **브라우저에서 로그인**: `http://localhost:3000/auth/login`
2. **"🔐 Google zkLogin으로 로그인" 버튼 클릭**
3. **Google OAuth 인증**
4. **JWT에서 자동으로 Sui 주소 계산**
5. **계정 자동 생성 및 세션 토큰 발급**

**특징:**

- **간편함**: Google 계정으로 간단 로그인
- **보안성**: zkLogin으로 프라이버시 보호
- **자동화**: JWT에서 자동으로 Sui 주소 계산
- **완전 자동화**: 계정 생성 시 지갑도 자동 생성 및 연결
- **토큰 기반 접근**: 모든 API는 Authorization 토큰만으로 접근 가능 (x-user-address 헤더 불필요)

**Google OAuth 설정 방법:**

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "API 및 서비스" → "사용자 인증 정보" 이동
4. "OAuth 2.0 클라이언트 ID" 생성
5. 승인된 리디렉션 URI에 `http://localhost:3000/auth/callback` 추가
6. 클라이언트 ID와 시크릿을 `.env` 파일에 설정

**GCP 비용:**

- OAuth 2.0 클라이언트 ID 생성: **무료**
- 월 100,000회 요청까지 무료
- 개발/테스트용으로는 충분함

**문제 해결:**

1. **Google OAuth 오류 시**: `.env` 파일에 올바른 `GOOGLE_CLIENT_SECRET` 설정 필요
2. **Google Cloud Console**: OAuth 2.0 클라이언트 ID가 올바르게 설정되었는지 확인
3. **리디렉션 URI**: `http://localhost:3000/auth/callback`이 승인된 URI에 포함되어 있는지 확인

**환경변수 설정:**

```bash
OIDC_ISSUER=https://accounts.google.com  # 기본값
OIDC_AUDIENCE=your_client_id             # 선택사항
SESSION_SECRET=your_secret_key           # JWT 서명용
```

**사용 방법:**

#### 방법 1: 브라우저에서 직접 로그인

```bash
# 1. 브라우저에서 로그인 페이지 접속
http://localhost:3000/auth/login

# 2. "🔐 Google zkLogin으로 로그인" 버튼 클릭
# 3. Google OAuth 인증 완료
# 4. JWT에서 자동으로 Sui 주소 계산
# 5. 자동으로 콜백 페이지로 이동
```

#### 방법 2: API를 통한 zkLogin (권장)

```bash
# 1. 프론트엔드에서 Google OAuth 로그인
# 2. JWT 토큰과 솔트를 받음
# 3. 백엔드에 zkLogin 요청

POST /auth/zklogin
Body:
{
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "salt": "1234567890"
}

# 응답
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "address": "0x1234567890abcdef..."  // JWT에서 자동 계산됨
  },
  "zkLoginAddress": "0x1234567890abcdef..."
}
```

### API 문서

Swagger UI: `http://localhost:3000/api-docs`

#### 📋 Swagger 문서화 지침

API 기능 변경 시 Swagger 문서를 올바르게 업데이트하기 위한 상세 지침은 [SWAGGER_GUIDELINES.md](./SWAGGER_GUIDELINES.md)를 참고하세요.

#### 주요 엔드포인트

**인증**

- `GET /auth/login` - **로그인 페이지** (브라우저)
- `GET /auth/callback` - **Google OAuth 콜백 처리**
- `POST /auth/login` - **OIDC 로그인** (API, JWT + 지갑 주소 필요)
- `POST /auth/zklogin` - **zkLogin 인증** (API, JWT에서 자동 주소 계산)

**지갑**

- `POST /wallet/create` - 지갑 생성
- `GET /wallet/balance/:address` - 잔액 조회

**쿠폰 (cryptoObject)**

- `POST /coupon/create-crypto-object` - cryptoObject 생성
- `POST /coupon/list-crypto-object-for-sale` - 판매 등록
- `POST /coupon/buy-crypto-object` - SUI로 구매
- `POST /coupon/buy-crypto-object-with-points` - 포인트로 구매
- `GET /coupon/crypto-objects-for-sale` - 판매 목록 조회
- `POST /coupon/decode-crypto-object` - 디코딩

**포인트**

- `GET /point/balance` - **포인트 잔액 조회**
- `POST /point/charge` - **포인트 충전** (누구나 사용 가능)

### 테스트용 Move 패키지

`move/Example` 폴더에 단순 `ping` entry function이 포함되어 있습니다.

배포 예시(로컬에서):

```bash
cd move/Example
sui move build
sui client switch --env devnet
sui client publish --gas-budget 50000000
# 출력되는 packageId를 API 호출 시 사용
```

### 참고

- 잔액 단위는 MIST입니다. 1 SUI = 10^9 MIST.
- 서버에 시드/개인키 저장은 보안 위험이 있으니, 실제 환경에서는 KMS/비밀관리와 접근제어를 적용하세요.
