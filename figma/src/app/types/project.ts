export type TaskStatus = 'needsAction' | 'completed';

export interface Task {
  id: string;
  title: string;
  notes?: string;  // Optional description field from Google Tasks
  status: TaskStatus;
  due?: string;  // RFC 3339 timestamp, optional
  taskListId: string;  // Reference to task list
  parent?: string;  // Parent task ID for subtasks
  position?: string;  // String indicating position in list
  links?: Array<{ type: string; description: string; link: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskList {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}