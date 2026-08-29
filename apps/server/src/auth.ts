import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "./config";

export interface SessionClaims {
  accountId: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function issueToken(claims: SessionClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: "7d", subject: claims.accountId });
}

export function verifyToken(token: string): SessionClaims {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded === "string") throw new Error("Invalid session token");
  const payload = decoded as JwtPayload & Partial<SessionClaims>;
  if (typeof payload.accountId !== "string" || typeof payload.username !== "string") {
    throw new Error("Invalid session claims");
  }
  return { accountId: payload.accountId, username: payload.username };
}

export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{2,23}$/.test(username);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}
