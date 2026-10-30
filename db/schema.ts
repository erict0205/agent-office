import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), name: text("name").notNull(), role: text("role").notNull(),
  status: text("status").notNull(), task: text("task").notNull(), seenAt: integer("seen_at").notNull(),
  deviceId: text("device_id").notNull().default("legacy"), deviceName: text("device_name").notNull().default("手動連線"),
  provider: text("provider").notNull().default("legacy"), client: text("client").notNull().default("Codex CLI"),
  sessionKey: text("session_key").notNull().default(""), source: text("source").notNull().default("runner"), stateAt: integer("state_at").notNull().default(0),
  category: text("category").notNull().default("general"),
});
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }), agentId: text("agent_id").notNull(),
  name: text("name").notNull(), status: text("status").notNull(), task: text("task").notNull(), at: integer("at").notNull(),
  deviceName: text("device_name").notNull().default("手動連線"), provider: text("provider").notNull().default("legacy"),
  category: text("category").notNull().default("general"),
});
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(), name: text("name").notNull(), platform: text("platform").notNull(),
  tools: text("tools").notNull(), seenAt: integer("seen_at").notNull(),
});
