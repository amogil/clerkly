import { useState } from 'react';
import { Plus, Filter, ChevronDown, ChevronRight, Clock, User, Users, Folder, CheckSquare, X } from 'lucide-react';
import type { Project, Task, TaskPriority, TaskStatus } from '@/app/types/project';

interface TasksViewNewProps {
  triggerAction?: { action: string; params: any } | null;
}

export function TasksViewNew({ triggerAction }: TasksViewNewProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  // Mock data
  const projects: Project[] = [
    {
      id: 'proj-1',
      title: 'Mobile App Redesign',
      description: 'Complete overhaul of the mobile application UI/UX',
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'proj-2',
      title: 'Backend API v2',
      description: 'Migrate to new REST API architecture',
      createdAt: new Date('2026-01-10'),
      updatedAt: new Date('2026-01-27'),
    },
    {
      id: 'proj-3',
      title: 'Marketing Campaign',
      description: 'Q1 2026 product launch marketing initiatives',
      createdAt: new Date('2026-01-20'),
      updatedAt: new Date('2026-01-28'),
    },
  ];

  const tasks: Task[] = [
    {
      id: 'task-1',
      title: 'Design new login screen',
      description: 'Create mockups for the new login experience',
      priority: 'high',
      status: 'in-progress',
      assignee: 'Sarah Chen',
      relatedPeople: ['Mike Johnson', 'Alex Rivera'],
      dueDate: new Date('2026-02-05'),
      projectId: 'proj-1',
      createdAt: new Date('2026-01-20'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-2',
      title: 'Implement dark mode',
      description: 'Add dark mode support across all screens',
      priority: 'medium',
      status: 'pending',
      assignee: 'Alex Rivera',
      relatedPeople: ['Sarah Chen'],
      dueDate: new Date('2026-02-10'),
      projectId: 'proj-1',
      createdAt: new Date('2026-01-22'),
      updatedAt: new Date('2026-01-27'),
    },
    {
      id: 'task-3',
      title: 'Update navigation bar',
      description: 'Redesign and implement new navigation patterns',
      priority: 'urgent',
      status: 'in-progress',
      assignee: 'Mike Johnson',
      relatedPeople: ['Sarah Chen', 'David Lee'],
      dueDate: new Date('2026-02-01'),
      projectId: 'proj-1',
      createdAt: new Date('2026-01-18'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-4',
      title: 'Setup authentication endpoints',
      description: 'Implement JWT-based authentication',
      priority: 'urgent',
      status: 'completed',
      assignee: 'David Lee',
      relatedPeople: ['Emma Wilson'],
      dueDate: new Date('2026-01-25'),
      projectId: 'proj-2',
      createdAt: new Date('2026-01-10'),
      updatedAt: new Date('2026-01-24'),
    },
    {
      id: 'task-5',
      title: 'Create API documentation',
      description: 'Write comprehensive API docs using OpenAPI',
      priority: 'medium',
      status: 'in-progress',
      assignee: 'Emma Wilson',
      relatedPeople: ['David Lee', 'Chris Brown'],
      dueDate: new Date('2026-02-15'),
      projectId: 'proj-2',
      createdAt: new Date('2026-01-15'),
      updatedAt: new Date('2026-01-28'),
    },
    {
      id: 'task-6',
      title: 'Database migration script',
      description: 'Create scripts for migrating existing data to new schema',
      priority: 'high',
      status: 'pending',
      assignee: 'Chris Brown',
      relatedPeople: ['David Lee'],
      dueDate: new Date('2026-02-08'),
      projectId: 'proj-2',
      createdAt: new Date('2026-01-12'),
      updatedAt: new Date('2026-01-26'),
    },
  ];

  const getFilteredTasks = (projectId?: string) => {
    return tasks.filter(task => {
      if (projectId && task.projectId !== projectId) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (assigneeFilter !== 'all' && task.assignee !== assigneeFilter) return false;
      return true;
    });
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'low':
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'in-progress':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pending':
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

  const allAssignees = Array.from(new Set(tasks.map(t => t.assignee))).sort();

  const displayedTasks = selectedProject 
    ? getFilteredTasks(selectedProject)
    : getFilteredTasks();

  const getProjectTaskCount = (projectId: string) => {
    return getFilteredTasks(projectId).length;
  };

  return (
    <div className="flex h-full">
      {/* Projects Sidebar */}
      <div className="w-80 border-r border-border bg-card overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Projects</h2>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>

        <div className="p-4">
          {/* All Tasks Option */}
          <button
            onClick={() => setSelectedProject(null)}
            className={`w-full flex items-center justify-between p-3 rounded-lg mb-2 transition-colors ${
              selectedProject === null
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-secondary text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5" />
              <span className="font-medium">All Tasks</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {getFilteredTasks().length}
            </span>
          </button>

          {/* Project List */}
          <div className="space-y-1">
            {projects.map((project) => {
              const taskCount = getProjectTaskCount(project.id);
              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    selectedProject === project.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                    <Folder className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{project.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {project.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground ml-2">
                    {taskCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="max-w-5xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-foreground mb-2">
                  {selectedProject 
                    ? projects.find(p => p.id === selectedProject)?.title 
                    : 'All Tasks'}
                </h1>
                <p className="text-muted-foreground">
                  {selectedProject
                    ? projects.find(p => p.id === selectedProject)?.description
                    : 'View and manage all your tasks across projects'}
                </p>
              </div>
              <button 
                onClick={() => setShowNewTaskModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Task</span>
              </button>
            </div>

            {/* Filters */}
            <div className="bg-card rounded-xl border border-border shadow-sm mb-6 p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
                  className="px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
                  className="px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Assignees</option>
                  {allAssignees.map(assignee => (
                    <option key={assignee} value={assignee}>{assignee}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-card rounded-xl border border-border shadow-sm">
              {displayedTasks.length > 0 ? (
                <div className="divide-y divide-border">
                  {displayedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-6 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-1">
                            {task.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {task.description}
                          </p>
                          {!selectedProject && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Folder className="w-3 h-3" />
                              <span>
                                {projects.find(p => p.id === task.projectId)?.title}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getPriorityColor(task.priority)}`}>
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(task.status)}`}>
                            {task.status === 'in-progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span>{task.assignee}</span>
                        </div>
                        
                        {task.relatedPeople.length > 0 && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="w-4 h-4" />
                            <div className="flex items-center gap-1">
                              {task.relatedPeople.slice(0, 2).map((person, idx) => (
                                <div
                                  key={idx}
                                  className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                                >
                                  {person.split(' ').map(n => n[0]).join('')}
                                </div>
                              ))}
                              {task.relatedPeople.length > 2 && (
                                <span className="text-xs ml-1">
                                  +{task.relatedPeople.length - 2}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className={
                            new Date('2026-01-28') > task.dueDate && task.status !== 'completed'
                              ? 'text-red-600 font-medium'
                              : ''
                          }>
                            {formatDate(task.dueDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">No tasks found</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedProject 
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
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project
                </label>
                <select className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Select a project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Task Title
                </label>
                <input
                  type="text"
                  placeholder="Enter task title"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  placeholder="Enter task description"
                  rows={4}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Priority
                  </label>
                  <select className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Assignee
                </label>
                <select className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Select assignee</option>
                  {allAssignees.map(assignee => (
                    <option key={assignee} value={assignee}>{assignee}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Handle task creation
                  setShowNewTaskModal(false);
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
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