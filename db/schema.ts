import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_users_updated_at").on(table.updatedAt)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["file", "folder"] }).notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    objectKey: text("object_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    isFavorite: integer("is_favorite").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastAccessedAt: integer("last_accessed_at").notNull(),
    deletedAt: integer("deleted_at"),
    originalParentId: text("original_parent_id"),
  },
  (table) => [
    check("items_type_check", sql`${table.type} in ('file', 'folder')`),
    check("items_favorite_check", sql`${table.isFavorite} in (0, 1)`),
    check("items_size_check", sql`${table.sizeBytes} >= 0`),
    check(
      "items_file_fields_check",
      sql`(${table.type} = 'file' and ${table.objectKey} is not null and ${table.mimeType} is not null) or (${table.type} = 'folder' and ${table.objectKey} is null and ${table.mimeType} is null and ${table.sizeBytes} = 0)`,
    ),
    index("idx_items_owner_id").on(table.ownerId),
    index("idx_items_parent_id").on(table.parentId),
    index("idx_items_owner_deleted_updated").on(
      table.ownerId,
      table.deletedAt,
      table.updatedAt,
    ),
    index("idx_items_owner_last_accessed").on(
      table.ownerId,
      table.lastAccessedAt,
    ),
    uniqueIndex("idx_items_active_sibling_name")
      .on(table.ownerId, table.parentId, table.nameKey)
      .where(sql`${table.deletedAt} is null and ${table.parentId} is not null`),
    uniqueIndex("idx_items_active_root_name")
      .on(table.ownerId, table.nameKey)
      .where(sql`${table.deletedAt} is null and ${table.parentId} is null`),
  ],
);

export const uploadSessions = sqliteTable(
  "upload_sessions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    relativePath: text("relative_path"),
    objectKey: text("object_key").notNull(),
    r2UploadId: text("r2_upload_id").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    partSizeBytes: integer("part_size_bytes").notNull(),
    status: text("status", {
      enum: ["active", "completing", "completed", "aborted"],
    }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    itemId: text("item_id"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    check(
      "upload_sessions_status_check",
      sql`${table.status} in ('active', 'completing', 'completed', 'aborted')`,
    ),
    check(
      "upload_sessions_size_check",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 5368709120`,
    ),
    check(
      "upload_sessions_part_size_check",
      sql`${table.partSizeBytes} = 8388608`,
    ),
    index("idx_upload_sessions_owner_status_updated").on(
      table.ownerId,
      table.status,
      table.updatedAt,
    ),
    index("idx_upload_sessions_expires_at").on(table.expiresAt),
    uniqueIndex("idx_upload_sessions_item_id")
      .on(table.itemId)
      .where(sql`${table.itemId} is not null`),
  ],
);

export const uploadParts = sqliteTable(
  "upload_parts",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => uploadSessions.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: integer("uploaded_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_upload_parts_session_number").on(
      table.sessionId,
      table.partNumber,
    ),
    check("upload_parts_number_check", sql`${table.partNumber} > 0`),
    check("upload_parts_size_check", sql`${table.sizeBytes} > 0`),
  ],
);
