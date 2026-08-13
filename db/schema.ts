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
