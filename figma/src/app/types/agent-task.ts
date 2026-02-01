export type AgentTaskStatus = 
  | 'waiting-input'      // Waiting for user input
  | 'requesting-info'    // Agent is requesting information from user
  | 'working'            // Agent is working
  | 'completed'          // Agent finished work
  | 'error';             // Error occurred

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: AgentTaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  progress?: number; // 0-100 for working tasks
}
