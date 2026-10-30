import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), name: text("name").notNull(), role: text("role").notNull(),
  status: text("status").notNull(), task: text("task").notNull(), seenAt: integer("seen_at").notNull(),
});
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }), agentId: text("agent_id").notNull(),
  name: text("name").notNull(), status: text("status").notNull(), task: text("task").notNull(), at: integer("at").notNull(),
});
