import { Hono } from "hono";
import type { Env } from "../types/env";
import type { ApiResponse, ApiError } from "@chronos/types/api";
import type { User } from "@chronos/types/user";
import { UserService } from "../services/user.service";
import * as authQueries from "../db/queries/auth";

const users = new Hono<{ Bindings: Env }>();

// Helper function to hash password using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Import the password as a key
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    data,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  
  // Combine salt and hash for storage
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  
  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined));
}

users.get("/", async (c) => {
  try {
    const userService = new UserService(c.env.DB);
    const allUsers = await userService.getAllUsers();

    const response: ApiResponse<User[]> = {
      data: allUsers,
      success: true,
      message: "Users retrieved successfully",
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to retrieve users",
      error: {
        code: "USER_FETCH_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return c.json(errorResponse, 500);
  }
});

users.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userService = new UserService(c.env.DB);
    const user = await userService.getUserById(id);

    if (!user) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "User not found",
        error: {
          code: "USER_NOT_FOUND",
          message: `User with id ${id} does not exist`,
        },
      };

      return c.json(errorResponse, 404);
    }

    const response: ApiResponse<User> = {
      data: user,
      success: true,
      message: "User retrieved successfully",
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to retrieve user",
      error: {
        code: "USER_FETCH_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return c.json(errorResponse, 500);
  }
});

users.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { email, username, first_name, last_name, role } = body;

    if (!email || !username) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and username are required",
          details: { 
            email: !email ? "required" : undefined, 
            username: !username ? "required" : undefined 
          },
        },
      };

      return c.json(errorResponse, 400);
    }

    const userService = new UserService(c.env.DB);
    const user = await userService.createUser({ email, username, first_name, last_name, role });

    const response: ApiResponse<User> = {
      data: user,
      success: true,
      message: "User created successfully",
    };

    return c.json(response, 201);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to create user",
      error: {
        code: "USER_CREATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    const statusCode = error instanceof Error && error.message.includes("already exists") ? 409 : 500;
    return c.json(errorResponse, statusCode);
  }
});

users.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { email, username, first_name, last_name, role } = body;

    const userService = new UserService(c.env.DB);
    const user = await userService.updateUser(id, { email, username, first_name, last_name, role });

    if (!user) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "User not found",
        error: {
          code: "USER_NOT_FOUND",
          message: `User with id ${id} does not exist`,
        },
      };

      return c.json(errorResponse, 404);
    }

    const response: ApiResponse<User> = {
      data: user,
      success: true,
      message: "User updated successfully",
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to update user",
      error: {
        code: "USER_UPDATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return c.json(errorResponse, 500);
  }
});

users.post("/with-password", async (c) => {
  try {
    const body = await c.req.json();
    const { email, username, password, first_name, last_name, role } = body;

    if (!email || !username || !password) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Email, username, and password are required",
          details: {
            email: !email ? "required" : undefined,
            username: !username ? "required" : undefined,
            password: !password ? "required" : undefined,
          },
        },
      };

      return c.json(errorResponse, 400);
    }

    if (password.length < 8) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters",
        },
      };

      return c.json(errorResponse, 400);
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create user with password
    const createdUser = await authQueries.createUserWithPassword(c.env.DB, {
      email,
      username,
      passwordHash,
      firstName: first_name,
      lastName: last_name,
      role: role || "user",
    });

    // Convert to User type (without password)
    const user: User = {
      id: createdUser.id,
      email: createdUser.email,
      username: createdUser.username,
      first_name: createdUser.first_name,
      last_name: createdUser.last_name,
      role: createdUser.role,
      created_at: createdUser.created_at,
      updated_at: createdUser.updated_at,
      deleted_at: createdUser.deleted_at,
    };

    const response: ApiResponse<User> = {
      data: user,
      success: true,
      message: "User created successfully",
    };

    return c.json(response, 201);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to create user",
      error: {
        code: "USER_CREATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    const statusCode = error instanceof Error && error.message.includes("already exists") ? 409 : 500;
    return c.json(errorResponse, statusCode);
  }
});

users.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userService = new UserService(c.env.DB);
    const deleted = await userService.deleteUser(id);

    if (!deleted) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "User not found",
        error: {
          code: "USER_NOT_FOUND",
          message: `User with id ${id} does not exist`,
        },
      };

      return c.json(errorResponse, 404);
    }

    const response: ApiResponse<{ id: string }> = {
      data: { id },
      success: true,
      message: "User deleted successfully",
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to delete user",
      error: {
        code: "USER_DELETE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return c.json(errorResponse, 500);
  }
});

export default users;
