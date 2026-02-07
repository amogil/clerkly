import React, { useState } from 'react';
import { Plus, Filter, Clock, Layers, CheckSquare, X, List } from 'lucide-react';

// Google Tasks API structure
type TaskStatus = 'needsAction' | 'completed';

interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  due: string; // RFC 3339 timestamp
  taskListId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskList {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export function TasksViewNew() {
  const [selectedTaskList, setSelectedTaskList] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  // Mock Task Lists (Google Tasks structure)
  const taskLists: TaskList[] = [
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
  ];

  // Mock Tasks (Google Tasks structure)
  const tasks: Task[] = [
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
  ];

  const getFilteredTasks = (taskListId?: string) => {
    return tasks.filter((task) => {
      if (taskListId && task.taskListId !== taskListId) return false;
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      return true;
    });
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'needsAction':
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date('2026-01-28');
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)}d overdue`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 7) {
      return `${diffDays}d`;
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayedTasks = selectedTaskList ? getFilteredTasks(selectedTaskList) : getFilteredTasks();

  const getTaskListTaskCount = (taskListId: string) => {
    return getFilteredTasks(taskListId).length;
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Tasks</h1>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>

        <div className="grid grid-cols-6 gap-6">
          {/* Task Lists Sidebar */}
          <div className="col-span-2">
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground mb-3">Task Lists</h2>
                <button className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors">
                  <Plus className="w-4 h-4" />
                  <span>New List</span>
                </button>
              </div>

              <div className="p-2">
                {/* All Tasks Option */}
                <button
                  onClick={() => setSelectedTaskList(null)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg mb-1 transition-colors ${
                    selectedTaskList === null
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CheckSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">All Tasks</span>
                  </div>
                  <span className="text-xs font-medium">{getFilteredTasks().length}</span>
                </button>

                {/* Task Lists */}
                <div className="space-y-1">
                  {taskLists.map((taskList) => {
                    const taskCount = getTaskListTaskCount(taskList.id);
                    return (
                      <button
                        key={taskList.id}
                        onClick={() => setSelectedTaskList(taskList.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                          selectedTaskList === taskList.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                          <List className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{taskList.title}</div>
                          </div>
                        </div>
                        <span className="text-xs font-medium ml-2">{taskCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-4">
            {/* Filters */}
            <div className="bg-card rounded-xl border border-border shadow-sm mb-6 p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
                  className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Status</option>
                  <option value="needsAction">Pending</option>
                  <option value="completed">Completed</option>
                </select>
                <div className="ml-auto text-sm text-muted-foreground">
                  {displayedTasks.length} {displayedTasks.length === 1 ? 'task' : 'tasks'}
                </div>
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-card rounded-xl border border-border shadow-sm">
              {displayedTasks.length > 0 ? (
                <div className="divide-y divide-border">
                  {displayedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-6 hover:bg-secondary/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-1">{task.title}</h3>
                          {task.notes && (
                            <p className="text-sm text-muted-foreground mb-2">{task.notes}</p>
                          )}
                          {!selectedTaskList && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <Layers className="w-3 h-3" />
                              <span>{taskLists.find((p) => p.id === task.taskListId)?.title}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusColor(task.status)}`}
                          >
                            {task.status === 'needsAction' ? 'Pending' : 'Completed'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span
                            className={
                              new Date('2026-01-28') > new Date(task.due) &&
                              task.status !== 'completed'
                                ? 'text-red-600 font-medium'
                                : ''
                            }
                          >
                            {formatDate(new Date(task.due))}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-16 text-center">
                  <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-2">No tasks found</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedTaskList
                      ? 'Try adjusting your filters or create a new task'
                      : 'Create a new task to get started'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">New Task</h2>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Task List</label>
                <select className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Select a task list</option>
                  {taskLists.map((taskList) => (
                    <option key={taskList.id} value={taskList.id}>
                      {taskList.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Task Title</label>
                <input
                  type="text"
                  placeholder="Enter task title"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Notes</label>
                <textarea
                  placeholder="Enter task notes"
                  rows={4}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Due Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="min-w-[120px] px-4 py-2.5 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Handle task creation
                  setShowNewTaskModal(false);
                }}
                className="min-w-[120px] px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
