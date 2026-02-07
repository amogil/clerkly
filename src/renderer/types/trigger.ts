export type TriggerEventType =
  | 'meeting_started'
  | 'meeting_ended'
  | 'task_created'
  | 'task_completed'
  | 'task_overdue'
  | 'contact_added'
  | 'daily_summary'
  | 'weekly_summary';

export interface TriggerExecution {
  id: string;
  timestamp: Date;
  chatId: string;
  status: 'success' | 'failed';
}

export interface Trigger {
  id: string;
  name: string;
  description: string;
  eventType: TriggerEventType;
  prompt: string;
  enabled: boolean;
  executions: TriggerExecution[];
  createdAt: Date;
  updatedAt: Date;
}

export const triggerEventLabels: Record<TriggerEventType, string> = {
  meeting_started: 'Meeting Started',
  meeting_ended: 'Meeting Ended',
  task_created: 'Task Created',
  task_completed: 'Task Completed',
  task_overdue: 'Task Overdue',
  contact_added: 'Contact Added',
  daily_summary: 'Daily Summary',
  weekly_summary: 'Weekly Summary',
};

export const triggerEventDescriptions: Record<TriggerEventType, string> = {
  meeting_started: 'Triggered when a meeting begins',
  meeting_ended: 'Triggered when a meeting ends',
  task_created: 'Triggered when a new task is created',
  task_completed: 'Triggered when a task is marked as completed',
  task_overdue: 'Triggered when a task becomes overdue',
  contact_added: 'Triggered when a new contact is added',
  daily_summary: 'Triggered once per day at 9:00 AM',
  weekly_summary: 'Triggered every Monday at 9:00 AM',
};
