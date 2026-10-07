import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  token: text().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Orders keep the client-generated id (e.g. ORD-1000) and the full record as JSON,
// so the offline-first frontend can round-trip whatever fields it stores.
export const orders = pgTable(
  "orders",
  {
    id: serial().primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    status: text().notNull().default("PENDING"),
    data: jsonb().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("orders_user_client_idx").on(t.userId, t.clientId)]
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: serial().primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("enrollments_user_client_idx").on(t.userId, t.clientId)]
);

// Append-only log of other synced operations (quiz results, missions, KYC doc pairs, expenses).
export const activity = pgTable("activity", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text().notNull(),
  data: jsonb().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
