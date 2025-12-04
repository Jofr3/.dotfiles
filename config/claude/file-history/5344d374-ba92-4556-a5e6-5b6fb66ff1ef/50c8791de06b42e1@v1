import type { D1 } from "@chronos/types/database";
import type { User } from "@chronos/types/user";
import * as userQueries from "../db/queries/users";

export class UserService {
  constructor(private db: D1) {}

  async getAllUsers(): Promise<User[]> {
    return userQueries.getAllUsers(this.db);
  }

  async getUserById(id: string): Promise<User | null> {
    return userQueries.getUserById(this.db, id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return userQueries.getUserByEmail(this.db, email);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return userQueries.getUserByUsername(this.db, username);
  }

  async createUser(data: { 
    email: string; 
    username: string; 
    first_name?: string; 
    last_name?: string;
    role?: "user" | "developer";
  }): Promise<User> {
    if (!this.isValidEmail(data.email)) {
      throw new Error("Invalid email format");
    }

    const existingUserByEmail = await this.getUserByEmail(data.email);
    if (existingUserByEmail) {
      throw new Error("User with this email already exists");
    }

    const existingUserByUsername = await this.getUserByUsername(data.username);
    if (existingUserByUsername) {
      throw new Error("User with this username already exists");
    }

    return userQueries.createUser(this.db, data);
  }

  async updateUser(
    id: string, 
    data: Partial<{ email: string; username: string; first_name: string; last_name: string; role: "user" | "developer" }>
  ): Promise<User | null> {
    if (data.email && !this.isValidEmail(data.email)) {
      throw new Error("Invalid email format");
    }

    return userQueries.updateUser(this.db, id, data);
  }

  async deleteUser(id: string): Promise<boolean> {
    return userQueries.deleteUser(this.db, id);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
