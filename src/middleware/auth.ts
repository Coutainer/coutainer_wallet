import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AppDataSource } from "../db/data-source";
import { User, UserRole } from "../entities/User";

// 환경변수 로드
dotenv.config();

export interface AuthenticatedRequest extends Request {
  userAddress?: string;
  userId?: number;
  userEmail?: string;
  userRole?: UserRole;
  user?: {
    id: number;
    address: string;
    email?: string;
    role?: UserRole;
  };
}

const sessionSecret = process.env.SESSION_SECRET || "your-secret-key-here";

export function requireUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  console.log("req.headers", req.headers);
  const token = req.headers.auth as string;
  console.log("Token received:", token);

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    console.log("Verifying token with secret:", sessionSecret);
    const decoded = jwt.verify(token, sessionSecret) as any;
    console.log("Decoded token:", decoded);

    // 토큰에서 사용자 정보 추출
    req.userAddress = decoded.address;
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    req.user = {
      id: decoded.sub,
      address: decoded.address,
      email: decoded.email,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// 사용자 역할을 DB에서 조회하는 미들웨어
export async function requireUserWithRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.auth as string;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, sessionSecret) as any;

    // DB에서 사용자 정보 조회
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: decoded.sub } });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // 토큰에서 사용자 정보 추출
    req.userAddress = decoded.address;
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    req.userRole = user.role;
    req.user = {
      id: decoded.sub,
      address: decoded.address,
      email: decoded.email,
      role: user.role,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Business 계정만 허용하는 미들웨어
export function requireBusiness(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.userRole !== UserRole.BUSINESS) {
    return res.status(403).json({ error: "Business account required" });
  }
  next();
}

// Consumer 계정만 허용하는 미들웨어
export function requireConsumer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.userRole !== UserRole.CONSUMER) {
    return res.status(403).json({ error: "Consumer account required" });
  }
  next();
}

// 관리자 권한 확인 미들웨어 (간단한 하드코딩된 관리자 주소)
const ADMIN_ADDRESSES = [
  "0x1234567890abcdef1234567890abcdef12345678", // 예시 관리자 주소
  // 실제 운영 시에는 환경변수나 DB에서 관리
];

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.auth as string;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, sessionSecret) as any;

    // 토큰에서 사용자 정보 추출
    req.userAddress = decoded.address;
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    req.user = {
      id: decoded.sub,
      address: decoded.address,
      email: decoded.email,
    };

    // 관리자 권한 확인
    if (!ADMIN_ADDRESSES.includes(decoded.address)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
