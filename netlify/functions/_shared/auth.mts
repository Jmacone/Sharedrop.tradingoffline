import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { sessions, users } from "../../../db/schema.js";

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export async function getUserId(req: Request): Promise<number | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())));
  return row ? row.userId : null;
}

export function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name };
}

export const unauthorized = () => Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
