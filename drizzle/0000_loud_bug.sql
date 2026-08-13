CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`type` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`object_key` text,
	`mime_type` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_accessed_at` integer NOT NULL,
	`deleted_at` integer,
	`original_parent_id` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "items_type_check" CHECK("items"."type" in ('file', 'folder')),
	CONSTRAINT "items_favorite_check" CHECK("items"."is_favorite" in (0, 1)),
	CONSTRAINT "items_size_check" CHECK("items"."size_bytes" >= 0),
	CONSTRAINT "items_file_fields_check" CHECK(("items"."type" = 'file' and "items"."object_key" is not null and "items"."mime_type" is not null) or ("items"."type" = 'folder' and "items"."object_key" is null and "items"."mime_type" is null and "items"."size_bytes" = 0))
);
--> statement-breakpoint
CREATE INDEX `idx_items_owner_id` ON `items` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_items_parent_id` ON `items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_items_owner_deleted_updated` ON `items` (`owner_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_items_owner_last_accessed` ON `items` (`owner_id`,`last_accessed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_items_active_sibling_name` ON `items` (`owner_id`,`parent_id`,`name_key`) WHERE "items"."deleted_at" is null and "items"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_items_active_root_name` ON `items` (`owner_id`,`name_key`) WHERE "items"."deleted_at" is null and "items"."parent_id" is null;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_users_updated_at` ON `users` (`updated_at`);