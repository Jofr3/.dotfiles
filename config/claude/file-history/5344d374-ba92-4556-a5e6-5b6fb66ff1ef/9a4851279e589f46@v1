import type { D1 } from "@chronos/types/database";
import type { AuthResponse, SignupRequest, AuthUser, JwtPayload } from "@chronos/types/auth";
import * as authQueries from "../db/queries/auth";

export class AuthService {
  constructor(
    private db: D1,
    private jwtSecret: string
  ) {}

  /**
   * Generate a JWT token using Web Crypto API
   */
  private async generateToken(user: AuthUser): Promise<string> {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const signature = await this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // Verify signature
      const expectedSignature = await this.sign(`${encodedHeader}.${encodedPayload}`);
      if (signature !== expectedSignature) {
        return null;
      }

      // Decode and parse payload
      const payload: JwtPayload = JSON.parse(this.base64UrlDecode(encodedPayload));

      // Check expiration
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Get user by ID (for session validation)
   */
  async getUserById(id: string): Promise<AuthUser | null> {
    const user = await authQueries.getUserById(this.db, id);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };
  }

  private async sign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
    return this.base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  }

  private base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private base64UrlDecode(str: string): string {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = str.length % 4;
    if (pad) {
      str += "=".repeat(4 - pad);
    }
    return atob(str);
  }

  /**
   * Hash a password using Web Crypto API (available in Cloudflare Workers)
   */
  private async hashPassword(password: string): Promise<string> {
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

  /**
   * Verify a password against a stored hash
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      
      // Decode the stored hash
      const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
      
      // Extract salt (first 16 bytes) and hash (remaining bytes)
      const salt = combined.slice(0, 16);
      const storedHashBytes = combined.slice(16);
      
      // Import the password as a key
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        data,
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      
      // Derive bits using the same salt
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
      
      const derivedHashBytes = new Uint8Array(derivedBits);
      
      // Compare hashes in constant time
      if (derivedHashBytes.length !== storedHashBytes.length) {
        return false;
      }
      
      let result = 0;
      for (let i = 0; i < derivedHashBytes.length; i++) {
        result |= derivedHashBytes[i] ^ storedHashBytes[i];
      }
      
      return result === 0;
    } catch {
      return false;
    }
  }

  /**
   * Register a new user
   */
  async signup(data: SignupRequest): Promise<AuthResponse> {
    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw new Error("Invalid email format");
    }

    // Validate password strength
    if (data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    // Check if user already exists
    const existingUser = await authQueries.userExistsByEmail(this.db, data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash the password
    const passwordHash = await this.hashPassword(data.password);

    // Generate username from email if not provided
    const username = data.username || data.email.split("@")[0];

    // Create the user
    const user = await authQueries.createUserWithPassword(this.db, {
      email: data.email,
      username: username,
      passwordHash: passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };

    const token = await this.generateToken(authUser);

    return {
      user: authUser,
      token,
      message: "Account created successfully",
    };
  }

  /**
   * Authenticate a user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Get user by email
    const user = await authQueries.getUserByEmailWithPassword(this.db, email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Check if user has a password set
    if (!user.password_hash) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };

    const token = await this.generateToken(authUser);

    return {
      user: authUser,
      token,
      message: "Login successful",
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
