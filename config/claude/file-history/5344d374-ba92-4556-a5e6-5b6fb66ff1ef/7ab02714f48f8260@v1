import { Hono } from "hono";
import type { Env } from "../types/env";
import type { ApiResponse, ApiError } from "@chronos/types/api";
import type { AuthResponse, LoginRequest, SignupRequest, AuthUser } from "@chronos/types/auth";
import { AuthService } from "../services/auth.service";

const auth = new Hono<{ Bindings: Env }>();

/**
 * Helper to extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * POST /api/auth/signup
 * Register a new user
 */
auth.post("/signup", async (c) => {
  try {
    const body = await c.req.json<SignupRequest>();
    const { email, password, username, firstName, lastName } = body;

    if (!email || !password) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required",
          details: {
            email: !email ? "required" : undefined,
            password: !password ? "required" : undefined,
          },
        },
      };

      return c.json(errorResponse, 400);
    }

    const authService = new AuthService(c.env.DB, c.env.JWT_SECRET);
    const result = await authService.signup({
      email,
      password,
      username,
      firstName,
      lastName,
    });

    const response: ApiResponse<AuthResponse> = {
      data: result,
      success: true,
      message: result.message,
    };

    return c.json(response, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Signup failed",
      error: {
        code: "SIGNUP_ERROR",
        message: message,
      },
    };

    if (message.includes("already exists")) {
      errorResponse.error.code = "USER_EXISTS";
      return c.json(errorResponse, 409);
    }
    
    if (message.includes("Invalid email") || message.includes("Password must")) {
      errorResponse.error.code = "VALIDATION_ERROR";
      return c.json(errorResponse, 400);
    }

    return c.json(errorResponse, 500);
  }
});

/**
 * POST /api/auth/login
 * Authenticate a user
 */
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json<LoginRequest>();
    const { email, password } = body;

    if (!email || !password) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required",
          details: {
            email: !email ? "required" : undefined,
            password: !password ? "required" : undefined,
          },
        },
      };

      return c.json(errorResponse, 400);
    }

    const authService = new AuthService(c.env.DB, c.env.JWT_SECRET);
    const result = await authService.login(email, password);

    const response: ApiResponse<AuthResponse> = {
      data: result,
      success: true,
      message: result.message,
    };

    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Login failed",
      error: {
        code: "LOGIN_ERROR",
        message: message,
      },
    };

    if (message.includes("Invalid email or password")) {
      errorResponse.error.code = "INVALID_CREDENTIALS";
      return c.json(errorResponse, 401);
    }
    
    if (message.includes("Invalid email")) {
      errorResponse.error.code = "VALIDATION_ERROR";
      return c.json(errorResponse, 400);
    }

    return c.json(errorResponse, 500);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
auth.get("/me", async (c) => {
  try {
    const token = extractBearerToken(c.req.header("Authorization"));

    if (!token) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Unauthorized",
        error: {
          code: "UNAUTHORIZED",
          message: "No token provided",
        },
      };

      return c.json(errorResponse, 401);
    }

    const authService = new AuthService(c.env.DB, c.env.JWT_SECRET);
    const payload = await authService.verifyToken(token);

    if (!payload) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "Unauthorized",
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token",
        },
      };

      return c.json(errorResponse, 401);
    }

    // Get fresh user data from database
    const user = await authService.getUserById(payload.sub);

    if (!user) {
      const errorResponse: ApiResponse<null> & { error: ApiError } = {
        data: null,
        success: false,
        message: "User not found",
        error: {
          code: "USER_NOT_FOUND",
          message: "User no longer exists",
        },
      };

      return c.json(errorResponse, 404);
    }

    const response: ApiResponse<AuthUser> = {
      data: user,
      success: true,
      message: "User retrieved successfully",
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ApiResponse<null> & { error: ApiError } = {
      data: null,
      success: false,
      message: "Failed to get user",
      error: {
        code: "AUTH_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return c.json(errorResponse, 500);
  }
});

export default auth;
