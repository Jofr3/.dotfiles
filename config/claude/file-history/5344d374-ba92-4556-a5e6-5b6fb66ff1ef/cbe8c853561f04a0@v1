import type { D1 } from "@chronos/types/database";
import type { Task, TaskList, TaskListWithTasks, DayOfWeek } from "@chronos/types";
import * as taskQueries from "../db/queries/tasks";

export class TaskService {
  constructor(private db: D1) {}

  // Task List methods
  async getAllTaskListsWithTasks(userId: string): Promise<TaskListWithTasks[]> {
    const lists = await taskQueries.getAllTaskLists(this.db, userId);
    
    const listsWithTasks = await Promise.all(
      lists.map(async (list) => {
        const tasks = await taskQueries.getTasksByListId(this.db, list.id);
        return {
          ...list,
          tasks,
        };
      })
    );

    return listsWithTasks;
  }

  async getTaskList(listId: string, userId: string): Promise<TaskListWithTasks | null> {
    const list = await taskQueries.getTaskListById(this.db, listId, userId);
    if (!list) return null;

    const tasks = await taskQueries.getTasksByListId(this.db, listId);
    
    return {
      ...list,
      tasks,
    };
  }

  async createTaskList(userId: string, name: string): Promise<TaskList> {
    const listId = crypto.randomUUID();
    return taskQueries.createTaskList(this.db, listId, userId, name);
  }

  async updateTaskList(listId: string, userId: string, name: string): Promise<TaskList | null> {
    return taskQueries.updateTaskList(this.db, listId, userId, name);
  }

  async deleteTaskList(listId: string, userId: string): Promise<boolean> {
    return taskQueries.deleteTaskList(this.db, listId, userId);
  }

  // Task methods
  async createTask(listId: string, userId: string, title: string): Promise<Task> {
    // Verify the list belongs to the user
    const list = await taskQueries.getTaskListById(this.db, listId, userId);
    if (!list) {
      throw new Error("Task list not found or access denied");
    }

    const taskId = crypto.randomUUID();
    return taskQueries.createTask(this.db, taskId, listId, title);
  }

  async updateTask(
    taskId: string, 
    userId: string, 
    updates: { 
      title?: string; 
      completed?: boolean;
      due_date?: string | null;
      is_recurring?: boolean;
      recurring_days?: DayOfWeek[] | null;
    }
  ): Promise<Task | null> {
    // Get the task to verify ownership
    const task = await taskQueries.getTaskById(this.db, taskId);
    if (!task) return null;

    // Verify the task's list belongs to the user
    const list = await taskQueries.getTaskListById(this.db, task.list_id, userId);
    if (!list) {
      throw new Error("Access denied");
    }

    return taskQueries.updateTask(this.db, taskId, updates);
  }

  async deleteTask(taskId: string, userId: string): Promise<boolean> {
    // Get the task to verify ownership
    const task = await taskQueries.getTaskById(this.db, taskId);
    if (!task) return false;

    // Verify the task's list belongs to the user
    const list = await taskQueries.getTaskListById(this.db, task.list_id, userId);
    if (!list) {
      throw new Error("Access denied");
    }

    return taskQueries.deleteTask(this.db, taskId);
  }
}
