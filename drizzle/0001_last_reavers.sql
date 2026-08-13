CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`relative_path` text,
	`object_key` text NOT NULL,
	`r2_upload_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`part_size_bytes` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "upload_sessions_status_check" CHECK("upload_sessions"."status" in ('active', 'completing', 'completed', 'aborted')),
	CONSTRAINT "upload_sessions_size_check" CHECK("upload_sessions"."size_bytes" > 0 and "upload_sessions"."size_bytes" <= 5368709120),
	CONSTRAINT "upload_sessions_part_size_check" CHECK("upload_sessions"."part_size_bytes" = 8388608)
);
--> statement-breakpoint
CREATE INDEX `idx_upload_sessions_owner_status_updated` ON `upload_sessions` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_upload_sessions_expires_at` ON `upload_sessions` (`expires_at`);