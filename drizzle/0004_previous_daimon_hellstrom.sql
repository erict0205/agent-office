CREATE TABLE `office_models` (
	`key` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_schedule_runs` (
	`run_key` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`workflow_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `office_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`device_id` text NOT NULL,
	`project_id` text NOT NULL,
	`workflow` text NOT NULL,
	`role` text NOT NULL,
	`model_id` text NOT NULL,
	`cadence` text NOT NULL,
	`weekday` integer NOT NULL,
	`minute_of_day` integer NOT NULL,
	`timezone` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`last_workflow_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `office_tasks` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `office_tasks` ADD `schedule_id` text;