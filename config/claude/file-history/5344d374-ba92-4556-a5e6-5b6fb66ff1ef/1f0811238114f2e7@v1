import { Hono } from "hono";
import type { Env } from "../types/env";
import { TaskService } from "../services/task.service";
import type { CreateTaskListRequest, CreateTaskRequest, UpdateTaskRequest, UpdateTaskListRequest } from "@chronos/types";

const tasks = new Hono<{ Bindings: Env }>();

// Helper to get user ID from auth token
async function getUserIdFromToken(authHeader: string | undefined, jwtSecret: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  try {
    // Decode JWT token manually (only need payload verification, no DB needed)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureData = await crypto.subtle.sign("HMAC", key, encoder.encode(`${encodedHeader}.${encodedPayload}`));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureData)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode and parse payload
    const pad = encodedPayload.length % 4;
    const paddedPayload = pad ? encodedPayload + "=".repeat(4 - pad) : encodedPayload;
    const payload = JSON.parse(atob(paddedPayload.replace(/-/g, "+").replace(/_/g, "/")));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload.sub; // 'sub' contains the user ID
  } catch {
    return null;
  }
}

// Get all task lists with tasks
tasks.get("/lists", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const taskService = new TaskService(c.env.DB);
    const lists = await taskService.getAllTaskListsWithTasks(userId);
    
    return c.json({ success: true, data: lists });
  } catch (error) {
    console.error("Error fetching task lists:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to fetch task lists" } 
      }, 
      500
    );
  }
});

// Get a single task list with tasks
tasks.get("/lists/:listId", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const listId = c.req.param("listId");
    const taskService = new TaskService(c.env.DB);
    const list = await taskService.getTaskList(listId, userId);
    
    if (!list) {
      return c.json({ success: false, error: { message: "Task list not found" } }, 404);
    }
    
    return c.json({ success: true, data: list });
  } catch (error) {
    console.error("Error fetching task list:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to fetch task list" } 
      }, 
      500
    );
  }
});

// Create a new task list
tasks.post("/lists", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const body = await c.req.json<CreateTaskListRequest>();
    
    if (!body.name || body.name.trim() === "") {
      return c.json({ success: false, error: { message: "List name is required" } }, 400);
    }
    
    const taskService = new TaskService(c.env.DB);
    const list = await taskService.createTaskList(userId, body.name);
    
    return c.json({ success: true, data: list }, 201);
  } catch (error) {
    console.error("Error creating task list:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to create task list" } 
      }, 
      500
    );
  }
});

// Update a task list
tasks.put("/lists/:listId", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const listId = c.req.param("listId");
    const body = await c.req.json<UpdateTaskListRequest>();
    
    if (!body.name || body.name.trim() === "") {
      return c.json({ success: false, error: { message: "List name is required" } }, 400);
    }
    
    const taskService = new TaskService(c.env.DB);
    const list = await taskService.updateTaskList(listId, userId, body.name);
    
    if (!list) {
      return c.json({ success: false, error: { message: "Task list not found" } }, 404);
    }
    
    return c.json({ success: true, data: list });
  } catch (error) {
    console.error("Error updating task list:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to update task list" } 
      }, 
      500
    );
  }
});

// Delete a task list
tasks.delete("/lists/:listId", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const listId = c.req.param("listId");
    const taskService = new TaskService(c.env.DB);
    const deleted = await taskService.deleteTaskList(listId, userId);
    
    if (!deleted) {
      return c.json({ success: false, error: { message: "Task list not found" } }, 404);
    }
    
    return c.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error deleting task list:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to delete task list" } 
      }, 
      500
    );
  }
});

// Create a new task in a list
tasks.post("/lists/:listId/tasks", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const listId = c.req.param("listId");
    const body = await c.req.json<CreateTaskRequest>();
    
    if (!body.title || body.title.trim() === "") {
      return c.json({ success: false, error: { message: "Task title is required" } }, 400);
    }
    
    const taskService = new TaskService(c.env.DB);
    const task = await taskService.createTask(listId, userId, body.title);
    
    return c.json({ success: true, data: task }, 201);
  } catch (error) {
    console.error("Error creating task:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to create task" } 
      }, 
      500
    );
  }
});

// Update a task
tasks.put("/tasks/:taskId", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const taskId = c.req.param("taskId");
    const body = await c.req.json<UpdateTaskRequest>();
    
    const taskService = new TaskService(c.env.DB);
    const task = await taskService.updateTask(taskId, userId, body);
    
    if (!task) {
      return c.json({ success: false, error: { message: "Task not found" } }, 404);
    }
    
    return c.json({ success: true, data: task });
  } catch (error) {
    console.error("Error updating task:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to update task" } 
      }, 
      500
    );
  }
});

// Delete a task
tasks.delete("/tasks/:taskId", async (c) => {
  try {
    const userId = await getUserIdFromToken(c.req.header("Authorization"), c.env.JWT_SECRET);
    if (!userId) {
      return c.json({ success: false, error: { message: "Unauthorized" } }, 401);
    }
    
    const taskId = c.req.param("taskId");
    const taskService = new TaskService(c.env.DB);
    const deleted = await taskService.deleteTask(taskId, userId);
    
    if (!deleted) {
      return c.json({ success: false, error: { message: "Task not found" } }, 404);
    }
    
    return c.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error deleting task:", error);
    return c.json(
      { 
        success: false, 
        error: { message: error instanceof Error ? error.message : "Failed to delete task" } 
      }, 
      500
    );
  }
});

export default tasks;
