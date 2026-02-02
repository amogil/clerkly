import {
  CheckCircle2,
  Circle,
  Calendar,
  User,
  Plus,
  Edit2,
  Trash2,
  FolderOpen,
  Users as UsersIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface Project {
  id: string;
  name: string;
  description: string;
  tasksCount: number;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  deadline: string;
  responsible: string;
  relatedContacts: string[];
  status: 'pending' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

interface TasksNewProps {
  triggerAction?: { action: string; params: any } | null;
}

export function TasksNew({ triggerAction }: TasksNewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('1');

  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: 'Q2 Product Roadmap',
      description: 'Planning and execution of Q2 product features',
      tasksCount: 8,
    },
    {
      id: '2',
      name: 'Mobile App Redesign',
      description: 'Complete redesign of mobile application',
      tasksCount: 12,
    },
    {
      id: '3',
      name: 'Client Onboarding',
      description: 'New client onboarding tasks and demos',
      tasksCount: 5,
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      projectId: '1',
      title: 'Prepare technical architecture document for AI integration',
      description: 'Create detailed technical architecture for the new AI features',
      deadline: 'February 3, 2026',
      responsible: 'Alex Rivera',
      relatedContacts: ['Sarah Chen', 'Mike Johnson'],
      status: 'pending',
      priority: 'high',
    },
    {
      id: '2',
      projectId: '1',
      title: 'Coordinate with design team for AI feature mockups',
      description: 'Schedule and conduct design review sessions',
      deadline: 'February 14, 2026',
      responsible: 'Alex Rivera',
      relatedContacts: ['Jessica Liu'],
      status: 'pending',
      priority: 'high',
    },
    {
      id: '3',
      projectId: '1',
      title: 'Review Q2 budget allocation',
      description: 'Review and approve budget for Q2 initiatives',
      deadline: 'February 5, 2026',
      responsible: 'Sarah Chen',
      relatedContacts: ['Mike Johnson'],
      status: 'pending',
      priority: 'high',
    },
    {
      id: '4',
      projectId: '2',
      title: 'Create wireframes for new mobile UI',
      description: 'Design initial wireframes for mobile app screens',
      deadline: 'February 10, 2026',
      responsible: 'Jessica Liu',
      relatedContacts: ['Sarah Chen', 'Alex Rivera'],
      status: 'pending',
      priority: 'medium',
    },
    {
      id: '5',
      projectId: '2',
      title: 'User testing for mobile prototype',
      description: 'Conduct user testing sessions with beta users',
      deadline: 'February 20, 2026',
      responsible: 'Mike Johnson',
      relatedContacts: ['Jessica Liu'],
      status: 'pending',
      priority: 'medium',
    },
    {
      id: '6',
      projectId: '3',
      title: 'Prepare client demo presentation',
      description: 'Create presentation materials for client demo',
      deadline: 'January 30, 2026',
      responsible: 'Jennifer Smith',
      relatedContacts: ['Tom Anderson'],
      status: 'completed',
      priority: 'high',
    },
  ]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectTasks = tasks.filter((t) => t.projectId === selectedProjectId);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Handle AI agent commands
  useEffect(() => {
    if (!triggerAction) return;

    if (triggerAction.action === 'create' && triggerAction.params.entity === 'project') {
      const newProject: Project = {
        id: Date.now().toString(),
        name: triggerAction.params.name || 'Untitled Project',
        description: '',
        tasksCount: 0,
      };
      setProjects((prev) => [...prev, newProject]);
      setSelectedProjectId(newProject.id);
    }

    if (triggerAction.action === 'create' && triggerAction.params.entity === 'task') {
      let targetProjectId = selectedProjectId;

      // Find project by name if specified
      if (triggerAction.params.projectName) {
        const foundProject = projects.find((p) =>
          p.name.toLowerCase().includes(triggerAction.params.projectName.toLowerCase())
        );
        if (foundProject) {
          targetProjectId = foundProject.id;
          setSelectedProjectId(foundProject.id);
        }
      }

      const newTask: Task = {
        id: Date.now().toString(),
        projectId: targetProjectId,
        title: triggerAction.params.name || 'Untitled Task',
        description: '',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        responsible: 'Unassigned',
        relatedContacts: [],
        status: 'pending',
        priority: 'medium',
      };
      setTasks((prev) => [...prev, newTask]);

      // Update project task count
      setProjects((prev) =>
        prev.map((p) => (p.id === targetProjectId ? { ...p, tasksCount: p.tasksCount + 1 } : p))
      );
    }
  }, [triggerAction, projects, selectedProjectId, setProjects, setTasks, setSelectedProjectId]);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">Tasks</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => console.log('New project')}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
            <button
              onClick={() => console.log('New task')}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Projects Sidebar */}
          <div className="col-span-4">
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Projects</h2>
              </div>
              <div className="divide-y divide-border">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`w-full p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${
                      selectedProjectId === project.id
                        ? 'bg-primary/5 border-l-4 border-l-primary'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-foreground">{project.name}</h3>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('Edit project');
                          }}
                          className="p-1 hover:bg-secondary rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete logic
                          }}
                          className="p-1 hover:bg-secondary rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {project.description}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {project.tasksCount} tasks
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="col-span-8">
            {selectedProject && (
              <div className="bg-card rounded-xl border border-border shadow-sm">
                <div className="p-6 border-b border-border">
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    {selectedProject.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{selectedProject.description}</p>
                </div>

                <div className="divide-y divide-border">
                  {projectTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-6 hover:bg-secondary/30 transition-colors ${
                        task.status === 'completed' ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-medium text-foreground mb-2 ${
                              task.status === 'completed' ? 'line-through' : ''
                            }`}
                          >
                            {task.title}
                          </h3>

                          <p className="text-sm text-muted-foreground mb-3">{task.description}</p>

                          <div className="flex flex-wrap gap-4 text-sm mb-3">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="w-4 h-4" />
                              <span className="font-medium text-foreground">
                                {task.responsible}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="w-4 h-4" />
                              <span>{task.deadline}</span>
                            </div>
                            <span
                              className={`text-xs px-2 py-1 rounded-full border font-medium ${getPriorityColor(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                          </div>

                          {task.relatedContacts.length > 0 && (
                            <div className="flex items-center gap-2">
                              <UsersIcon className="w-4 h-4 text-muted-foreground" />
                              <div className="flex items-center gap-2">
                                {task.relatedContacts.map((contact, idx) => (
                                  <span
                                    key={idx}
                                    className="text-xs bg-secondary px-2 py-1 rounded-full text-foreground"
                                  >
                                    {contact}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => console.log('Edit task')}
                            className="p-2 hover:bg-secondary rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => {
                              // Delete task logic
                            }}
                            className="p-2 hover:bg-secondary rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {projectTasks.length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-muted-foreground">No tasks in this project</p>
                      <button
                        onClick={() => console.log('Create task')}
                        className="mt-4 text-sm text-primary hover:underline"
                      >
                        Create your first task
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
