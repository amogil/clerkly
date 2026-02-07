import { createContext, useContext, useState, ReactNode } from 'react';
import type { Task, TaskList } from '@/app/types/project';

interface TasksContextType {
  tasks: Task[];
  taskLists: TaskList[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTaskList: (taskList: TaskList) => void;
  updateTaskList: (id: string, updates: Partial<TaskList>) => void;
  deleteTaskList: (id: string) => void;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [taskLists, setTaskLists] = useState<TaskList[]>([
    {
      id: 'tasklist-1',
      title: 'Mobile App Redesign',
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'tasklist-2',
      title: 'Backend API v2',
      createdAt: new Date('2026-01-10'),
      updatedAt: new Date('2026-01-27'),
    },
    {
      id: 'tasklist-3',
      title: 'Marketing Campaign',
      createdAt: new Date('2026-01-20'),
      updatedAt: new Date('2026-01-28'),
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 'task-1',
      title: 'Design new login screen',
      notes: 'Create mockups for the new login experience',
      status: 'needsAction',
      due: '2026-02-05T00:00:00.000Z',
      taskListId: 'tasklist-1',
      createdAt: new Date('2026-01-20'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-2',
      title: 'Implement dark mode',
      notes: 'Add dark mode support across all screens',
      status: 'needsAction',
      due: '2026-02-10T00:00:00.000Z',
      taskListId: 'tasklist-1',
      createdAt: new Date('2026-01-22'),
      updatedAt: new Date('2026-01-27'),
    },
    {
      id: 'task-3',
      title: 'Update navigation bar',
      notes: 'Redesign and implement new navigation patterns',
      status: 'needsAction',
      due: '2026-02-01T00:00:00.000Z',
      taskListId: 'tasklist-1',
      createdAt: new Date('2026-01-18'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-4',
      title: 'Setup authentication endpoints',
      notes: 'Implement JWT-based authentication',
      status: 'completed',
      due: '2026-01-25T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-10'),
      updatedAt: new Date('2026-01-24'),
    },
    {
      id: 'task-5',
      title: 'Create API documentation',
      notes: 'Write comprehensive API docs using OpenAPI',
      status: 'needsAction',
      due: '2026-02-15T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-6',
      title: 'Database migration script',
      notes: 'Create scripts for migrating existing data to new schema',
      status: 'needsAction',
      due: '2026-02-08T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-12'),
      updatedAt: new Date('2026-01-26'),
    },
    {
      id: 'task-7',
      title: 'Review API documentation',
      notes: 'Review and approve backend API documentation',
      status: 'needsAction',
      due: '2026-02-05T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-28'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-8',
      title: 'Update user authentication flow',
      notes: 'Improve security and UX of authentication process',
      status: 'needsAction',
      due: '2026-02-05T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-28'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-9',
      title: 'Design system color tokens',
      notes: 'Define and implement new color system',
      status: 'needsAction',
      due: '2026-02-05T00:00:00.000Z',
      taskListId: 'tasklist-1',
      createdAt: new Date('2026-01-28'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-10',
      title: 'Write test cases for payment module',
      notes: 'Create comprehensive test coverage for payment integration',
      status: 'needsAction',
      due: '2026-02-05T00:00:00.000Z',
      taskListId: 'tasklist-2',
      createdAt: new Date('2026-01-28'),
      updatedAt: new Date('2026-01-28'),
    },
  ]);

  const addTask = (task: Task) => {
    setTasks(prev => [...prev, task]);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id ? { ...task, ...updates, updatedAt: new Date() } : task
      )
    );
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const addTaskList = (taskList: TaskList) => {
    setTaskLists(prev => [...prev, taskList]);
  };

  const updateTaskList = (id: string, updates: Partial<TaskList>) => {
    setTaskLists(prev =>
      prev.map(list =>
        list.id === id ? { ...list, ...updates, updatedAt: new Date() } : list
      )
    );
  };

  const deleteTaskList = (id: string) => {
    setTaskLists(prev => prev.filter(list => list.id !== id));
    // Also delete all tasks in this list
    setTasks(prev => prev.filter(task => task.taskListId !== id));
  };

  return (
    <TasksContext.Provider
      value={{
        tasks,
        taskLists,
        addTask,
        updateTask,
        deleteTask,
        addTaskList,
        updateTaskList,
        deleteTaskList,
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
}
