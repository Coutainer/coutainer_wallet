# Swagger 문서화 지침

## 📋 개요

이 문서는 API 기능 변경 시 Swagger 문서를 올바르게 업데이트하기 위한 지침입니다.

## 🔄 기능 변경 시 체크리스트

### 1. 인증 관련 변경

- [ ] **새로운 인증 엔드포인트 추가 시**

  - `src/routes/auth.ts`에 `@openapi` 주석 추가
  - `security: [bearerAuth: []]` 추가 (인증이 필요한 경우)
  - `tags: [1️⃣ 인증]` 사용

- [ ] **기존 인증 로직 변경 시**
  - 요청/응답 스키마 업데이트
  - 설명(description) 업데이트
  - 예시(example) 업데이트

### 2. API 엔드포인트 변경

- [ ] **새로운 엔드포인트 추가 시**

  - 해당 라우터 파일에 `@openapi` 주석 추가
  - 적절한 태그 선택:
    - `1️⃣ 인증`: 로그인, 회원가입
    - `1️⃣ 지갑`: 지갑 관련 기능
    - `2️⃣ 쿠폰`: cryptoObject 관련 기능
    - `포인트`: 포인트 시스템
    - `Move`: Sui Move 컨트랙트 호출
    - `데이터베이스`: DB 상태 확인

- [ ] **기존 엔드포인트 수정 시**
  - 요청/응답 스키마 업데이트
  - 파라미터 변경사항 반영
  - 에러 응답 코드 추가/수정

### 3. 인증 방식 변경

- [ ] **토큰 기반 인증으로 변경 시**

  - `security: [bearerAuth: []]` 추가
  - `x-user-address` 헤더 제거
  - 요청 스키마에서 불필요한 필드 제거

- [ ] **공개 API로 변경 시**
  - `security` 섹션 제거
  - 인증 관련 설명 제거

### 4. 데이터 모델 변경

- [ ] **엔티티 스키마 변경 시**
  - 해당 엔티티를 사용하는 모든 API의 스키마 업데이트
  - 필드 추가/제거/타입 변경 반영
  - 예시 데이터 업데이트

## 📝 Swagger 주석 작성 규칙

### 기본 구조

```typescript
/**
 * @openapi
 * /api/path:
 *   method:
 *     tags:
 *       - 태그명
 *     summary: 간단한 설명
 *     description: 자세한 설명
 *     security:
 *       - bearerAuth: []  // 인증이 필요한 경우
 *     parameters:  // URL 파라미터가 있는 경우
 *       - in: path
 *         name: paramName
 *         schema:
 *           type: string
 *         required: true
 *         description: 파라미터 설명
 *     requestBody:  // POST/PUT 요청인 경우
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - field1
 *             properties:
 *               field1:
 *                 type: string
 *                 description: 필드 설명
 *                 example: "예시값"
 *     responses:
 *       200:
 *         description: 성공 응답
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 */
```

### 태그 사용 규칙

- `1️⃣ 인증`: 사용자 인증, 로그인, 회원가입
- `1️⃣ 지갑`: Sui 지갑 관리, 잔액 조회, 전송
- `2️⃣ 쿠폰`: cryptoObject 생성, 거래, 디코딩
- `포인트`: 포인트 충전, 조회, 사용
- `Move`: Sui Move 스마트 컨트랙트 호출
- `데이터베이스`: DB 상태 확인, 마이그레이션

### 보안 설정

- **인증 필요**: `security: [bearerAuth: []]`
- **공개 API**: `security` 섹션 없음
- **관리자 전용**: `security: [bearerAuth: []]` + 코드에서 `requireAdmin` 사용

## 🔍 변경사항 검증

### 1. 로컬 테스트

```bash
# 서버 실행
npm run dev

# Swagger UI 확인
# http://localhost:3000/api-docs

# Swagger 스펙 검증
npm run swagger:check
```

### 2. 체크포인트

- [ ] 모든 엔드포인트가 Swagger에 표시되는가?
- [ ] 요청/응답 스키마가 실제 코드와 일치하는가?
- [ ] 인증 설정이 올바른가?
- [ ] 예시 데이터가 유효한가?
- [ ] 에러 응답이 모두 정의되어 있는가?

## 🚨 주의사항

### 1. 일관성 유지

- 같은 기능의 API들은 동일한 태그 사용
- 비슷한 스키마는 재사용 가능하도록 설계
- 네이밍 컨벤션 통일

### 2. 실시간 업데이트

- 코드 변경과 동시에 Swagger 주석도 업데이트
- 나중에 업데이트하면 누락 가능성 높음
- PR 리뷰 시 Swagger 변경사항도 함께 검토

### 3. 버전 관리

- API 버전 변경 시 Swagger 버전도 함께 업데이트
- 하위 호환성 고려
- Deprecated API 표시

## 📚 참고 자료

### Swagger/OpenAPI 3.0 스펙

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger Editor](https://editor.swagger.io/)

### 현재 프로젝트 설정

- Swagger 설정: `src/index.ts`
- 보안 스키마: `bearerAuth`
- 서버 URL: `http://localhost:3000`

## 🔧 자동화 도구

### Swagger 검증

```bash
# Swagger 스펙 검증 (빌드 후)
npm run swagger:check

# 또는 개별 실행
npm run build
npm run swagger:validate

# OpenAPI 스펙 검증 (선택사항)
npx @apidevtools/swagger-parser validate dist/swagger.json
```

### 코드 생성

```bash
# TypeScript 타입 생성 (선택사항)
npx openapi-typescript http://localhost:3000/api-docs -o src/types/api.ts
```

---

**💡 팁**: 기능 변경 시 이 체크리스트를 따라가면 Swagger 문서를 빠뜨리지 않고 업데이트할 수 있습니다!
