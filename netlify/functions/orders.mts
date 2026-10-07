import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orders } from "../../db/schema.js";
import { getUserId, unauthorized } from "./_shared/auth.mjs";

export default async (req: Request) => {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  return Response.json({ success: true, orders: rows.map((r) => ({ ...(r.data as object), id: r.clientId, status: r.status })) });
};

export const config: Config = {
  path: "/api/orders",
  method: "GET",
};
