ALTER TABLE `upload_sessions` ADD `item_id` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `completed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_upload_sessions_item_id` ON `upload_sessions` (`item_id`) WHERE "upload_sessions"."item_id" is not null;