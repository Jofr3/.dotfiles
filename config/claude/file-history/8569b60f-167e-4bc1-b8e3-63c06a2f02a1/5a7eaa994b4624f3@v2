# Querying with drizzle-orm

Reference for writing query code in a project. For one-off lookups against a live database, use the
`drizzle-db` CLI instead.

Docs: <https://orm.drizzle.team/docs/rqb> · <https://orm.drizzle.team/docs/select>

## Connecting

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Connection-string shorthand
const db = drizzle(process.env.DATABASE_URL!, { schema });

// Or pass an existing client, which you need for pooling or custom options
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL!, { max: 10 });
const db = drizzle(client, { schema, casing: 'snake_case' });
```

`{ schema }` is what enables the relational query API (`db.query.*`). `casing: 'snake_case'` maps
camelCase TS properties to snake_case columns so you can stop writing the column name twice.

Swap the import for another dialect: `drizzle-orm/node-postgres`, `drizzle-orm/neon-http`,
`drizzle-orm/mysql2`, `drizzle-orm/better-sqlite3`, `drizzle-orm/libsql`, `drizzle-orm/mssql`.

## Select

```ts
import { eq, and, or, ne, gt, gte, lt, inArray, like, ilike, isNull, desc, asc, sql } from 'drizzle-orm';

const all = await db.select().from(users);

// Projection — pick columns, and compute new ones
const rows = await db
  .select({ id: users.id, email: users.email, orders: sql<number>`count(${orders.id})` })
  .from(users)
  .leftJoin(orders, eq(orders.userId, users.id))
  .where(and(eq(users.active, true), gt(users.createdAt, cutoff)))
  .groupBy(users.id)
  .orderBy(desc(users.createdAt))
  .limit(50)
  .offset(100);

// Composing conditions: undefined entries are dropped, so optional filters are easy
const where = and(
  eq(users.active, true),
  search ? ilike(users.email, `%${search}%`) : undefined,
);
```

Joins: `.innerJoin()`, `.leftJoin()`, `.rightJoin()`, `.fullJoin()`. A joined select returns rows
shaped `{ users: {...}, orders: {...} }` unless you supply an explicit projection.

## Relational queries

Needs `{ schema }` on the client and `relations()` declarations. Returns nested objects instead of
flat join rows, and issues one query rather than N+1.

```ts
const result = await db.query.users.findMany({
  where: (users, { eq }) => eq(users.active, true),
  columns: { id: true, email: true },
  with: {
    posts: {
      columns: { id: true, title: true },
      where: (posts, { isNull }) => isNull(posts.deletedAt),
      orderBy: (posts, { desc }) => desc(posts.createdAt),
      limit: 5,
      with: { comments: true },
    },
  },
  orderBy: (users, { asc }) => asc(users.email),
  limit: 20,
});

const one = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, id) });
```

## Insert, update, delete

```ts
await db.insert(users).values({ email, name });

// Batch, and get generated columns back
const created = await db
  .insert(users)
  .values([{ email: 'a@x.com' }, { email: 'b@x.com' }])
  .returning({ id: users.id });

// Upsert
await db.insert(users)
  .values({ email, name })
  .onConflictDoUpdate({ target: users.email, set: { name } });   // postgres / sqlite
await db.insert(users)
  .values({ email, name })
  .onDuplicateKeyUpdate({ set: { name } });                      // mysql

await db.update(users).set({ name }).where(eq(users.id, id)).returning();
await db.delete(users).where(eq(users.id, id));
```

`.returning()` is postgres and sqlite only. On MySQL, read back with a follow-up select using
`insertId`.

## Transactions

```ts
await db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({ email }).returning();
  await tx.insert(profiles).values({ userId: user.id });
  if (somethingWrong) tx.rollback();   // throws, unwinding the transaction
});
```

Every query inside the callback must use `tx`, not `db` — using `db` runs outside the transaction and
will not roll back.

## Raw SQL

```ts
import { sql } from 'drizzle-orm';

// Interpolated values are bound as parameters, not concatenated
const rows = await db.execute(sql`select * from users where id = ${id}`);

// Fragments inside the query builder
await db.select().from(users).where(sql`${users.email} ilike ${'%' + term + '%'}`);
await db.select({ total: sql<number>`sum(${orders.amount})::int` }).from(orders);

// sql.raw() does NOT parameterize — only for trusted, non-user-derived text
await db.execute(sql.raw(statementBuiltInternally));
```

Row shape from `db.execute` varies by driver: postgres-js returns an array, node-postgres returns
`{ rows }`, mysql2 returns `[rows, fields]`. SQLite clients use `db.all()` / `db.get()` / `db.run()`
instead. The CLI in this skill normalizes all of that; application code should handle whichever
driver it actually uses.

## Prepared statements

Worth it for hot paths — the SQL is built once.

```ts
const byId = db.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare('users_by_id');
const user = await byId.execute({ id: 42 });
```

## Common mistakes

- Using `db` instead of `tx` inside a transaction callback.
- Expecting `.returning()` to work on MySQL.
- `db.query.*` returning `undefined` — the client was built without `{ schema }`.
- Comparing with `==` instead of `eq()`; a bare `where(users.id === id)` compiles but is nonsense.
- Building SQL with string concatenation instead of `sql` template interpolation, which loses
  parameter binding.
