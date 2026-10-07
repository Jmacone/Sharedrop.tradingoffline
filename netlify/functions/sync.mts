import type { Config } from "@netlify/functions";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { activity, enrollments, orders } from "../../db/schema.js";
import { getUserId, unauthorized } from "./_shared/auth.mjs";

type Operation = { type: string; data: Record<string, any> };

const MAX_OPS = 500;
const ACTIVITY_TYPES = new Set(["quiz_submit", "mission_update", "log_doc_pair", "log_expense"]);

// Applies the frontend's offline write queue in order. Each op is idempotent
// where possible so a retried flush doesn't create duplicates.
async function apply(userId: number, op: Operation) {
  const data = op.data || {};
  const clientId = typeof data.id === "string" ? data.id : null;
  const own = (id: string) => and(eq(orders.userId, userId), eq(orders.clientId, id));

  switch (op.type) {
    case "create":
      if (!clientId) throw new Error("Order id required");
      await db
        .insert(orders)
        .values({ userId, clientId, status: String(data.status || "PENDING"), data })
        .onConflictDoUpdate({
          target: [orders.userId, orders.clientId],
          set: { data, status: String(data.status || "PENDING"), updatedAt: new Date() },
        });
      return;
    case "update": {
      if (!clientId) throw new Error("Order id required");
      const patch: Record<string, unknown> = {};
      if (data.status !== undefined) patch.status = data.status;
      if (data.driver !== undefined) patch.driver = data.driver;
      await db
        .update(orders)
        .set({
          data: sql`${orders.data} || ${JSON.stringify(patch)}::jsonb`,
          ...(data.status !== undefined ? { status: String(data.status) } : {}),
          updatedAt: new Date(),
        })
        .where(own(clientId));
      return;
    }
    case "delete":
      if (!clientId) throw new Error("Order id required");
      await db.delete(orders).where(own(clientId));
      return;
    case "create_enrollment":
      if (!clientId) throw new Error("Enrollment id required");
      await db
        .insert(enrollments)
        .values({ userId, clientId, data })
        .onConflictDoUpdate({ target: [enrollments.userId, enrollments.clientId], set: { data } });
      return;
    default:
      if (!ACTIVITY_TYPES.has(op.type)) throw new Error(`Unknown operation type: ${op.type}`);
      await db.insert(activity).values({ userId, type: op.type, data });
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  let operations: Operation[];
  try {
    ({ operations } = await req.json());
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(operations)) {
    return Response.json({ success: false, error: "operations must be an array" }, { status: 400 });
  }
  if (operations.length > MAX_OPS) {
    return Response.json({ success: false, error: `Too many operations (max ${MAX_OPS})` }, { status: 413 });
  }

  const results = [];
  for (const op of operations) {
    try {
      await apply(userId, op);
      results.push({ type: op?.type, ok: true });
    } catch (e) {
      results.push({ type: op?.type, ok: false, error: (e as Error).message });
    }
  }
  return Response.json({ success: true, applied: results.filter((r) => r.ok).length, results });
};

export const config: Config = {
  path: "/api/sync",
};
