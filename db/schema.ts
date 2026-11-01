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

export const officeSettings = sqliteTable('office_settings', { key:text('key').primaryKey(), value:text('value').notNull() });
export const officeProjects = sqliteTable('office_projects', {
  key:text('key').primaryKey(), deviceId:text('device_id').notNull(), projectId:text('project_id').notNull(), name:text('name').notNull(), seenAt:integer('seen_at').notNull(),
});
export const officeTasks = sqliteTable('office_tasks', {
  id:text('id').primaryKey(), workflowId:text('workflow_id').notNull(), stage:integer('stage').notNull(),
  title:text('title').notNull(), prompt:text('prompt').notNull(), deviceId:text('device_id').notNull(), projectId:text('project_id').notNull(),
  role:text('role').notNull(), status:text('status').notNull(), agentId:text('agent_id').notNull(),
  createdAt:integer('created_at').notNull(), updatedAt:integer('updated_at').notNull(),
  leaseToken:text('lease_token'), leaseUntil:integer('lease_until'), attempt:integer('attempt').notNull().default(0),
  result:text('result').notNull().default(''), diff:text('diff').notNull().default(''), approval:text('approval'),
});
export const privateEvents = sqliteTable('private_events', {
  id:text('id').primaryKey(), agentId:text('agent_id').notNull(), taskId:text('task_id'),
  kind:text('kind').notNull(), label:text('label').notNull(), detail:text('detail').notNull(), at:integer('at').notNull(),
});
export const officeCommands = sqliteTable('office_commands', {
  id:text('id').primaryKey(), taskId:text('task_id').notNull(), kind:text('kind').notNull(), payload:text('payload').notNull(),
  createdAt:integer('created_at').notNull(), acknowledged:integer('acknowledged').notNull().default(0),
});
