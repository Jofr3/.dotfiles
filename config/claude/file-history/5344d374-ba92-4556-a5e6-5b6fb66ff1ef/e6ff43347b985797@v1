import type { D1 } from "@chronos/types/database";
import type { User } from "@chronos/types/user";

/**
 * Get all users from the database
 */

export async function getAllUsers(db: D1): Promise<User[]> {
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
  const result = await stmt.all<User>();

  if (!result.success) {
    throw new Error(result.error || "Failed to fetch users");
  }

  return result.results.map(mapUserToUser);
}

/**
 * Get a user by ID
 */
export async function getUserById(db: D1, id: string): Promise<User | null> {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?").bind(id);
  const user = await stmt.first<User>();

  if (!user) {
    return null;
  }

  return mapUserToUser(user);
}

/**
 * Get a user by email
 */
export async function getUserByEmail(db: D1, email: string): Promise<User | null> {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?").bind(email);
  const user = await stmt.first<User>();

  if (!user) {
    return null;
  }

  return mapUserToUser(user);
}

/**
 * Get a user by username
 */
export async function getUserByUsername(db: D1, username: string): Promise<User | null> {
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?").bind(username);
  const user = await stmt.first<User>();

  if (!user) {
    return null;
  }

  return mapUserToUser(user);
}

/**
 * Create a new user
 */
export async function createUser(
  db: D1,
  data: { email: string; username: string; first_name?: string; last_name?: string; role?: "user" | "developer" }
): Promise<User> {
  const stmt = db.prepare(
    "INSERT INTO users (email, username, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)"
  ).bind(data.email, data.username, data.first_name || null, data.last_name || null, data.role || "user");

  const result = await stmt.run();

  if (!result.success) {
    throw new Error(result.error || "Failed to create user");
  }

  // Fetch the created user to get the auto-generated ID
  const createdUser = await getUserByEmail(db, data.email);
  if (!createdUser) {
    throw new Error("Failed to retrieve created user");
  }

  return createdUser;
}

/**
 * Update a user
 */
export async function updateUser(
  db: D1,
  id: string,
  data: Partial<{ email: string; username: string; first_name: string; last_name: string; role: "user" | "developer" }>
): Promise<User | null> {
  const existingUser = await getUserById(db, id);
  if (!existingUser) {
    return null;
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.email !== undefined) {
    updates.push("email = ?");
    values.push(data.email);
  }

  if (data.username !== undefined) {
    updates.push("username = ?");
    values.push(data.username);
  }

  if (data.first_name !== undefined) {
    updates.push("first_name = ?");
    values.push(data.first_name);
  }

  if (data.last_name !== undefined) {
    updates.push("last_name = ?");
    values.push(data.last_name);
  }

  if (data.role !== undefined) {
    updates.push("role = ?");
    values.push(data.role);
  }

  if (updates.length === 0) {
    return existingUser;
  }

  updates.push("updated_at = ?");
  values.push(now);
  values.push(id);

  const stmt = db.prepare(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...values);

  const result = await stmt.run();

  if (!result.success) {
    throw new Error(result.error || "Failed to update user");
  }

  return getUserById(db, id);
}

/**
 * Delete a user
 */
export async function deleteUser(db: D1, id: string): Promise<boolean> {
  const stmt = db.prepare("DELETE FROM users WHERE id = ?").bind(id);
  const result = await stmt.run();

  if (!result.success) {
    throw new Error(result.error || "Failed to delete user");
  }

  return result.meta.rows_written > 0;
}

/**
 * Helper function to map database row to User type
 */
function mapUserToUser(row: User): User {
  return {
    id: row.id.toString(),
    email: row.email,
    username: row.username,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    role: row.role || "user",
    created_at: new Date(row.created_at),
    updated_at: row.updated_at ? new Date(row.updated_at) : null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}
