import type { Config } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { enrollments } from "../../db/schema.js";
import { getUserId, unauthorized } from "./_shared/auth.mjs";

export default async (req: Request) => {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const rows = await db.select().from(enrollments).where(eq(enrollments.userId, userId)).orderBy(asc(enrollments.createdAt));
  return Response.json({ success: true, enrollments: rows.map((r) => ({ ...(r.data as object), id: r.clientId })) });
};

export const config: Config = {
  path: "/api/applicants",
  method: "GET",
};
