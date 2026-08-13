CREATE TABLE `upload_parts` (
	`session_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `upload_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "upload_parts_number_check" CHECK("upload_parts"."part_number" > 0),
	CONSTRAINT "upload_parts_size_check" CHECK("upload_parts"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_upload_parts_session_number` ON `upload_parts` (`session_id`,`part_number`);