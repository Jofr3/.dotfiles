# Drag-and-Drop Task List Implementation Plan

## Overview
Implement HTML5 native drag-and-drop to allow users to move tasks between task lists by dragging. Tasks can only be moved between regular task lists (not to/from "New Events" list which shows tasks without a list_id).

## User Requirements Summary
- **Approach**: HTML5 native drag-and-drop API (no external library)
- **Scope**: Tasks can be dragged between regular task lists only. "New Events" list is NOT a drop target
- **Visual Feedback**: Highlight drop zones, show drag preview, dim dragged task

## Implementation Steps

### 1. Backend: Enable list_id Updates

#### 1.1 Update Shared Types
**File**: `/home/jofre/projects/chronos/packages/types/src/task.ts`

Add `list_id` to `UpdateTaskRequest` interface (line 50-59):
```typescript
export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  completed?: boolean;
  due_date?: string | null;
  priority?: TaskPriority;
  duration?: number | null;
  is_recurring?: boolean;
  recurring_days?: DayOfWeek[] | null;
  list_id?: string | null;  // ADD THIS
}
```

#### 1.2 Update Database Query
**File**: `/home/jofre/projects/chronos/apps/backend/src/db/queries/tasks.ts`

In `updateTask` function, add list_id handling after line 260:
```typescript
if (updates.list_id !== undefined) updateData.list_id = updates.list_id;
```

Also update the function signature (line 235-244) to accept list_id:
```typescript
export async function updateTask(
  db: DrizzleClient,
  taskId: string,
  updates: {
    title?: string;
    description?: string | null;
    completed?: boolean;
    due_date?: string | null;
    priority?: TaskPriority;
    duration?: number | null;
    is_recurring?: boolean;
    recurring_days?: DayOfWeek[] | null;
    list_id?: string | null;  // ADD THIS
  }
): Promise<Task | null>
```

#### 1.3 Add List Ownership Validation
**File**: `/home/jofre/projects/chronos/apps/backend/src/services/task.service.ts`

Update `updateTask` method signature (line 71-84) to accept list_id:
```typescript
async updateTask(
  taskId: string,
  userId: string,
  updates: {
    title?: string;
    description?: string | null;
    completed?: boolean;
    due_date?: string | null;
    priority?: TaskPriority;
    duration?: number | null;
    is_recurring?: boolean;
    recurring_days?: DayOfWeek[] | null;
    list_id?: string | null;  // ADD THIS
  }
): Promise<Task | null>
```

Add validation before line 94 (before calling taskQueries.updateTask):
```typescript
// Verify target list belongs to user if list_id is being changed
if (updates.list_id !== undefined && updates.list_id !== null) {
  const targetList = await taskQueries.getTaskListById(this.db, updates.list_id, userId);
  if (!targetList) {
    throw new Error("Target list not found or access denied");
  }
}
```

### 2. Frontend: Implement Drag-and-Drop UI

#### 2.1 Add Drag State Management
**File**: `/home/jofre/projects/chronos/apps/frontend/src/routes/(app)/tasks/index.tsx`

Add after line 60 (after editModal state):
```typescript
// Drag-and-drop state
const dragState = useStore({
  isDragging: false,
  draggedTaskId: null as string | null,
  draggedFromListId: null as string | null,
  dropTargetListId: null as string | null,
});
```

#### 2.2 Create Drag Event Handlers
Add after line 301 (after toggleRecurringDay function):
```typescript
// Drag-and-drop handlers
const handleDragStart = $((taskId: string, listId: string | null, e: DragEvent) => {
  dragState.isDragging = true;
  dragState.draggedTaskId = taskId;
  dragState.draggedFromListId = listId;

  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', taskId);

  // Create semi-transparent drag preview
  const draggedElement = e.currentTarget as HTMLElement;
  const clone = draggedElement.cloneNode(true) as HTMLElement;
  clone.style.opacity = '0.7';
  clone.style.position = 'absolute';
  clone.style.top = '-9999px';
  document.body.appendChild(clone);
  e.dataTransfer!.setDragImage(clone, e.offsetX, e.offsetY);
  setTimeout(() => document.body.removeChild(clone), 0);
});

const handleDragEnd = $(() => {
  dragState.isDragging = false;
  dragState.draggedTaskId = null;
  dragState.draggedFromListId = null;
  dragState.dropTargetListId = null;
});

const handleDragOver = $((listId: string, e: DragEvent) => {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  dragState.dropTargetListId = listId;
});

const handleDragLeave = $(() => {
  dragState.dropTargetListId = null;
});

const handleDrop = $(async (targetListId: string, e: DragEvent) => {
  e.preventDefault();

  const taskId = dragState.draggedTaskId;
  const sourceListId = dragState.draggedFromListId;

  // Reset drag state
  dragState.isDragging = false;
  dragState.draggedTaskId = null;
  dragState.draggedFromListId = null;
  dragState.dropTargetListId = null;

  // No-op if dropping on same list
  if (taskId && sourceListId === targetListId) return;
  if (!taskId) return;

  try {
    // Find the task
    const task = sourceListId === null
      ? tasksWithoutList.value.find(t => t.id === taskId)
      : lists.value.find(l => l.id === sourceListId)?.tasks.find(t => t.id === taskId);

    if (!task) return;

    // Optimistic UI update: Remove from source
    if (sourceListId === null) {
      tasksWithoutList.value = tasksWithoutList.value.filter(t => t.id !== taskId);
    } else {
      lists.value = lists.value.map(list => {
        if (list.id === sourceListId) {
          return { ...list, tasks: list.tasks.filter(t => t.id !== taskId) };
        }
        return list;
      });
    }

    // Add to target with updated list_id
    const updatedTask = { ...task, list_id: targetListId };
    lists.value = lists.value.map(list => {
      if (list.id === targetListId) {
        return { ...list, tasks: [...list.tasks, updatedTask] };
      }
      return list;
    });

    // Make API call
    await taskService.updateTask(taskId, { list_id: targetListId });

  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to move task";
    console.error("Error moving task:", err);

    // Revert on error - reload data
    try {
      const [allLists, tasksNoList] = await Promise.all([
        taskService.getAllTaskLists(),
        taskService.getTasksWithoutList(),
      ]);
      lists.value = allLists;
      tasksWithoutList.value = tasksNoList;
    } catch (reloadErr) {
      console.error("Error reloading after failed move:", reloadErr);
    }
  }
});
```

#### 2.3 Make Task Items Draggable

**For "New Events" tasks** (around line 424):
Update the task item div to add drag attributes:
```tsx
<div
  key={task.id}
  class={`task-item ${dragState.isDragging && dragState.draggedTaskId === task.id ? 'dragging' : ''}`}
  style={`animation-delay: ${taskIndex * 0.05}s;`}
  draggable={true}
  onDragStart$={(e) => handleDragStart(task.id, null, e)}
  onDragEnd$={handleDragEnd}
  onClick$={(e) => { /* existing onClick handler */ }}
>
```

**For regular list tasks** (around line 673):
Update the task item div similarly:
```tsx
<div
  key={task.id}
  class={`task-item ${dragState.isDragging && dragState.draggedTaskId === task.id ? 'dragging' : ''}`}
  style={`animation-delay: ${taskIndex * 0.05}s;`}
  draggable={true}
  onDragStart$={(e) => handleDragStart(task.id, list.id, e)}
  onDragEnd$={handleDragEnd}
  onClick$={(e) => { /* existing onClick handler */ }}
>
```

#### 2.4 Make List Cards Droppable (Regular Lists Only)

**For "New Events" list** (around line 402):
DO NOT add drop handlers - keep as is:
```tsx
<div
  key="new-events"
  class="task-list-card new-events-list"
  style="animation-delay: 0s;"
>
```

**For regular lists** (around line 591):
Add drop handlers and conditional class:
```tsx
<div
  key={list.id}
  class={`task-list-card ${dragState.isDragging && dragState.dropTargetListId === list.id ? 'drop-target' : ''}`}
  style={`animation-delay: ${listIndex * 0.1}s;`}
  onDragOver$={(e) => handleDragOver(list.id, e)}
  onDragLeave$={handleDragLeave}
  onDrop$={(e) => handleDrop(list.id, e)}
>
```

### 3. CSS: Add Visual Feedback

**File**: `/home/jofre/projects/chronos/apps/frontend/src/styles/tasks.css`

Add at the end of the file:
```css
/* Drag-and-Drop Styles */

/* Task being dragged - reduce opacity */
.task-item.dragging {
  opacity: 0.4;
  cursor: grabbing;
}

/* Drop target list - highlight border */
.task-list-card.drop-target {
  border-color: var(--text-primary);
  border-width: 2px;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}

/* Cursor states */
.task-item[draggable="true"] {
  cursor: grab;
}

/* Prevent text selection during drag */
.task-item[draggable="true"] * {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
```

## Critical Files Modified

1. `/home/jofre/projects/chronos/packages/types/src/task.ts` - Add list_id to UpdateTaskRequest
2. `/home/jofre/projects/chronos/apps/backend/src/db/queries/tasks.ts` - Handle list_id updates
3. `/home/jofre/projects/chronos/apps/backend/src/services/task.service.ts` - Validate list ownership
4. `/home/jofre/projects/chronos/apps/frontend/src/routes/(app)/tasks/index.tsx` - Drag-drop logic
5. `/home/jofre/projects/chronos/apps/frontend/src/styles/tasks.css` - Visual feedback styling

## Key Design Decisions

1. **No "New Events" as Drop Target**: Users cannot drag tasks to "New Events" list to maintain semantic clarity (that list shows unassigned tasks)
2. **Can Drag FROM "New Events"**: Users can drag tasks from "New Events" to regular lists to assign them
3. **Optimistic UI Updates**: UI updates immediately, with rollback on API error
4. **Security**: Backend validates both task and target list ownership
5. **Same-List No-op**: Dropping on the same list does nothing (no API call)

## Verification Checklist

After implementation, test:
- [ ] Drag task from List A to List B - task moves
- [ ] Drag task within same list - nothing happens (no API call)
- [ ] Drag task from "New Events" to regular list - task moves and gets list_id
- [ ] Try to drop on "New Events" - not possible (no highlight, no drop)
- [ ] Visual feedback: dragged task has opacity, drop zones highlight
- [ ] Error handling: simulate API failure and verify rollback
- [ ] Task counts update correctly after move
- [ ] Progress bars update correctly after move
- [ ] Multiple browsers: Chrome, Firefox, Safari

## Known Limitations

- **Mobile/Touch Devices**: HTML5 drag-and-drop doesn't work on touch screens. Future enhancement could add touch event handlers or modal-based list selection for mobile users.
- **Accessibility**: Screen readers have limited drag-and-drop support. Future enhancement could add keyboard shortcuts or context menu options.
