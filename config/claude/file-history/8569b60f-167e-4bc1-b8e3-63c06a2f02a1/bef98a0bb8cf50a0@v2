# Defining schemas

Docs: <https://orm.drizzle.team/docs/sql-schema-declaration>

Import from the dialect-specific core: `drizzle-orm/pg-core`, `drizzle-orm/mysql-core`,
`drizzle-orm/sqlite-core`, `drizzle-orm/mssql-core`. Mixing cores in one schema file will not work.

## PostgreSQL

```ts
import {
  pgTable, pgEnum, serial, integer, bigint, text, varchar, boolean,
  timestamp, jsonb, uuid, numeric, index, uniqueIndex, primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['admin', 'member', 'guest']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: text('name'),
  role: roleEnum('role').notNull().default('member'),
  settings: jsonb('settings').$type<{ theme: string }>().default({ theme: 'light' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
}, (t) => [
  index('users_role_idx').on(t.role),
  uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
]);

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

// Composite primary key
export const postTags = pgTable('post_tags', {
  postId: integer('post_id').notNull().references(() => posts.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, (t) => [primaryKey({ columns: [t.postId, t.tagId] })]);
```

The table's second argument returns an **array** of indexes and constraints in current drizzle
versions. Older code returns an object literal; match whichever style the project already uses.

## MySQL

```ts
import { mysqlTable, int, varchar, text, boolean, timestamp, json, mysqlEnum, index } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: mysqlEnum('role', ['admin', 'member']).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('users_role_idx').on(t.role)]);
```

MySQL has no `serial`-with-sequence and no `returning`. `varchar` requires an explicit `length`.

## SQLite / libsql / Turso

```ts
import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  settings: text('settings', { mode: 'json' }).$type<{ theme: string }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

SQLite has no native boolean, json, or timestamp type — the `mode` option handles the conversion.

## Relations

Separate from foreign keys: `references()` creates the database constraint, `relations()` is what
`db.query.*` uses to build nested results. Declare both.

```ts
export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  tags: many(postTags),
}));
```

For many-to-many, declare `many()` on both sides plus `one()` on each side of the join table.

## Inferring types

```ts
type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
```

Use these instead of hand-written interfaces — they stay in sync with the schema.

## Conventions

- Column names go in the string argument; the TS property can differ. `casing: 'snake_case'` on the
  client removes the need to write both.
- Keep the whole schema exported from one barrel so `drizzle(client, { schema })` sees every table
  and relation.
- `$type<T>()` narrows json/jsonb columns; `$defaultFn` / `$onUpdate` run in JS rather than in SQL.
