export type AgentTaskStatus =
  | 'new' // New chat (light blue)
  | 'in-progress' // Agent is working (blue with spinner)
  | 'awaiting-user' // Awaiting user response (yellow)
  | 'error' // Error occurred (red)
  | 'completed'; // Agent finished work (green)

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: AgentTaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}
