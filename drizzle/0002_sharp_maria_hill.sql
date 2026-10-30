ALTER TABLE `agents` ADD `category` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `category` text DEFAULT 'general' NOT NULL;