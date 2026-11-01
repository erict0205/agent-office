CREATE TABLE `office_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`acknowledged` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_projects` (
	`key` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`stage` integer NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`device_id` text NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`agent_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`attempt` integer DEFAULT 0 NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`diff` text DEFAULT '' NOT NULL,
	`approval` text
);
--> statement-breakpoint
CREATE TABLE `private_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	`at` integer NOT NULL
);
