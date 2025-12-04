import type { D1 } from "@chronos/types/database";
import type { UserWithPassword } from "@chronos/types/auth";

interface UserRow {
  id: number;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  role: "user" | "developer";
  password_hash: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

/**
 * Get a user by email including password hash for authentication
 */
export async function getUserByEmailWithPassword(
  db: D1,
  email: string
): Promise<UserWithPassword | null> {
  const stmt = db.prepare(
    "SELECT id, email, username, first_name, last_name, role, password_hash, created_at, updated_at, deleted_at FROM users WHERE email = ?"
  ).bind(email);
  
  const user = await stmt.first<UserRow>();

  if (!user) {
    return null;
  }

  return mapRowToUserWithPassword(user);
}

/**
 * Create a new user with password hash
 */
export async function createUserWithPassword(
  db: D1,
  data: {
    email: string;
    username: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    role?: "user" | "developer";
  }
): Promise<UserWithPassword> {
  const stmt = db.prepare(
    "INSERT INTO users (email, username, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    data.email,
    data.username,
    data.passwordHash,
    data.firstName || null,
    data.lastName || null,
    data.role || "user"
  );

  const result = await stmt.run();

  if (!result.success) {
    throw new Error(result.error || "Failed to create user");
  }

  const createdUser = await getUserByEmailWithPassword(db, data.email);
  if (!createdUser) {
    throw new Error("Failed to retrieve created user");
  }

  return createdUser;
}

/**
 * Check if a user with the given email already exists
 */
export async function userExistsByEmail(db: D1, email: string): Promise<boolean> {
  const stmt = db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email);
  const result = await stmt.first();
  return result !== null;
}

/**
 * Get a user by ID
 */
export async function getUserById(db: D1, id: string): Promise<UserWithPassword | null> {
  const stmt = db.prepare(
    "SELECT id, email, username, first_name, last_name, role, password_hash, created_at, updated_at, deleted_at FROM users WHERE id = ?"
  ).bind(id);

  const user = await stmt.first<UserRow>();

  if (!user) {
    return null;
  }

  return mapRowToUserWithPassword(user);
}

/**
 * Helper function to map database row to UserWithPassword type
 */
function mapRowToUserWithPassword(row: UserRow): UserWithPassword {
  return {
    id: row.id.toString(),
    email: row.email,
    username: row.username,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    role: row.role || "user",
    password_hash: row.password_hash,
    created_at: new Date(row.created_at),
    updated_at: row.updated_at ? new Date(row.updated_at) : null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}
