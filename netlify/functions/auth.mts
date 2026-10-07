import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { createSession, hashPassword, publicUser, verifyPassword } from "./_shared/auth.mjs";

const fail = (error: string, status: number) => Response.json({ success: false, error }, { status });

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return fail("Email and password are required", 400);

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (context.params.action === "register") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address", 400);
    if (password.length < 8) return fail("Password must be at least 8 characters", 400);
    if (existing) return fail("An account with this email already exists", 409);
    const [user] = await db
      .insert(users)
      .values({ email, name: String(body.name || "").trim(), passwordHash: hashPassword(password) })
      .returning();
    const token = await createSession(user.id);
    return Response.json({ success: true, token, user: publicUser(user) }, { status: 201 });
  }

  if (!existing || !verifyPassword(password, existing.passwordHash)) {
    return fail("Invalid email or password", 401);
  }
  const token = await createSession(existing.id);
  return Response.json({ success: true, token, user: publicUser(existing) });
};

export const config: Config = {
  path: "/api/auth/:action(login|register)",
};
