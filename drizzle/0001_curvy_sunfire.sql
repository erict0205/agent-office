CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`tools` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `device_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `device_name` text DEFAULT '手動連線' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `provider` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `client` text DEFAULT 'Codex CLI' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `session_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `source` text DEFAULT 'runner' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `state_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `device_name` text DEFAULT '手動連線' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `provider` text DEFAULT 'legacy' NOT NULL;