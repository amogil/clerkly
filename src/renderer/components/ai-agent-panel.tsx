import { useState, useRef, useEffect } from 'react';
import {
  Send,
  AlertCircle,
  Check,
  X,
  HelpCircle,
  ArrowLeft,
  Plus,
  FileText,
  Calendar,
  Video,
} from 'lucide-react';
import type { AgentTask } from '@/app/types/agent-task';
import { Logo } from './logo';
import { DateTimeFormatter } from '../utils/DateTimeFormatter';

interface AIAgentPanelProps {
  onCommand: (command: string) => void;
}

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string | React.ReactNode;
  timestamp: Date;
}

export function AIAgentPanel({ onCommand }: AIAgentPanelProps) {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [taskInput, setTaskInput] = useState('');

  // Agent tasks data - examples of all statuses
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([
    {
      id: 'task-1',
      title: 'Question about pricing',
      description: 'New conversation started',
      status: 'new',
      createdAt: new Date('2026-02-02T15:00:00'),
      updatedAt: new Date('2026-02-02T15:00:00'),
    },
    {
      id: 'task-2',
      title: 'Transcribing meeting',
      description: 'Processing audio from meeting',
      status: 'in-progress',
      createdAt: new Date('2026-02-02T14:30:00'),
      updatedAt: new Date('2026-02-02T14:35:00'),
    },
    {
      id: 'task-3',
      title: 'Which Jira project?',
      description: 'Need to select project',
      status: 'awaiting-user',
      createdAt: new Date('2026-02-02T11:20:00'),
      updatedAt: new Date('2026-02-02T11:25:00'),
    },
    {
      id: 'task-4',
      title: 'Email connection failed',
      description: 'Failed to send report',
      status: 'error',
      createdAt: new Date('2026-02-02T08:00:00'),
      updatedAt: new Date('2026-02-02T08:05:00'),
      errorMessage: 'Connection timeout',
    },
    {
      id: 'task-5',
      title: 'Meeting summary sent',
      description: 'Summary sent successfully',
      status: 'completed',
      createdAt: new Date('2026-02-02T09:00:00'),
      updatedAt: new Date('2026-02-02T09:15:00'),
      completedAt: new Date('2026-02-02T09:15:00'),
    },
    {
      id: 'task-6',
      title: 'Extract action items',
      description: 'Analyzing meeting transcript',
      status: 'completed',
      createdAt: new Date('2026-02-01T16:00:00'),
      updatedAt: new Date('2026-02-01T16:10:00'),
      completedAt: new Date('2026-02-01T16:10:00'),
    },
  ]);

  // Current selected task - default to first task
  const [selectedTask, setSelectedTask] = useState<AgentTask>(agentTasks[0]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when task changes
  useEffect(() => {
    scrollToBottom();
  }, [selectedTask]);

  const handleSend = () => {
    if (!taskInput.trim()) return;

    // Handle sending message for current task
    onCommand(taskInput);
    setTaskInput('');
  };

  // Removed unused function formatTime and getStatusIcon

  const getStatusText = (status: AgentTask['status']) => {
    switch (status) {
      case 'new':
        return 'New';
      case 'in-progress':
        return 'In progress';
      case 'awaiting-user':
        return 'Awaiting response';
      case 'error':
        return 'Error';
      case 'completed':
        return 'Completed';
    }
  };

  // Get messages for specific task
  const getTaskMessages = (taskId: string): Message[] => {
    const taskMessagesMap: Record<string, Message[]> = {
      'task-1': [
        {
          id: 't1-1',
          type: 'user',
          content: 'What are the pricing options for enterprise customers?',
          timestamp: new Date('2026-02-02T15:00:00'),
        },
      ],
      'task-2': [
        {
          id: 't2-1',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>Started transcribing the Product Roadmap Review meeting.</p>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Video className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Product Roadmap Review</p>
                  <p className="text-xs text-muted-foreground">Audio duration: 45 minutes</p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T14:30:00'),
        },
        {
          id: 't2-2',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>Transcription in progress. Identified 8 action items so far.</p>
            </div>
          ),
          timestamp: new Date('2026-02-02T14:35:00'),
        },
      ],
      'task-3': [
        {
          id: 't3-1',
          type: 'agent',
          content: 'I found 5 tasks from the Design Sync meeting. Which Jira project should I use?',
          timestamp: new Date('2026-02-02T11:20:00'),
        },
        {
          id: 't3-2',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p className="mb-3">Available projects:</p>
              <div className="space-y-2">
                <button className="w-full p-3 bg-secondary/50 hover:bg-secondary rounded-lg border border-border hover:border-primary/50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-purple-600">D</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">DESIGN</p>
                      <p className="text-xs text-muted-foreground">Design Team</p>
                    </div>
                  </div>
                </button>
                <button className="w-full p-3 bg-secondary/50 hover:bg-secondary rounded-lg border border-border hover:border-primary/50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-blue-600">P</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">PROD</p>
                      <p className="text-xs text-muted-foreground">Product Development</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T11:21:00'),
        },
      ],
      'task-4': [
        {
          id: 't4-1',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>Preparing weekly report for stakeholders...</p>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Weekly Report</p>
                  <p className="text-xs text-muted-foreground">Week of Jan 27 - Feb 2</p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T08:00:00'),
        },
        {
          id: 't4-2',
          type: 'agent',
          content: (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-600 mb-1">Connection Error</p>
                  <p className="text-xs text-red-600/80">
                    Failed to connect to email server. Connection timeout after 30 seconds.
                  </p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T08:05:00'),
        },
        {
          id: 't4-3',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p className="mb-3">Would you like me to:</p>
              <div className="space-y-2">
                <button className="w-full p-3 bg-secondary/50 hover:bg-secondary rounded-lg border border-border hover:border-primary/50 transition-colors text-left text-sm">
                  1. Retry sending
                </button>
                <button className="w-full p-3 bg-secondary/50 hover:bg-secondary rounded-lg border border-border hover:border-primary/50 transition-colors text-left text-sm">
                  2. Save report as PDF
                </button>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T08:05:30'),
        },
      ],
      'task-5': [
        {
          id: 't5-1',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>Generated summary for Team Standup meeting.</p>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Team Standup</p>
                  <p className="text-xs text-muted-foreground">Feb 2, 2026 at 9:00 AM</p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T09:00:00'),
        },
        {
          id: 't5-2',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p className="mb-3">Summary includes:</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="text-2xl font-bold text-red-600">3</div>
                  <div className="text-xs text-muted-foreground">Blockers</div>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="text-2xl font-bold text-green-600">7</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="text-2xl font-bold text-blue-600">5</div>
                  <div className="text-xs text-muted-foreground">In Progress</div>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T09:10:00'),
        },
        {
          id: 't5-3',
          type: 'agent',
          content: (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">
                  Summary sent to team@company.com
                </span>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T09:15:00'),
        },
      ],
      'task-6': [
        {
          id: 't6-1',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>Extracted action items from the meeting transcript.</p>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Meeting Transcript</p>
                  <p className="text-xs text-muted-foreground">Week of Jan 27 - Feb 2</p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-01T16:00:00'),
        },
        {
          id: 't6-2',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p className="mb-3">Action items:</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="text-2xl font-bold text-red-600">3</div>
                  <div className="text-xs text-muted-foreground">Blockers</div>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="text-2xl font-bold text-green-600">7</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="text-2xl font-bold text-blue-600">5</div>
                  <div className="text-xs text-muted-foreground">In Progress</div>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-01T16:05:00'),
        },
        {
          id: 't6-3',
          type: 'agent',
          content: (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">
                  Action items extracted successfully
                </span>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-01T16:10:00'),
        },
      ],
    };
    return taskMessagesMap[taskId] || [];
  };

  const handleTaskClick = (task: AgentTask) => {
    setSelectedTask(task);
    setShowAllTasksPage(false);
  };

  const handleNewChat = () => {
    // Create new chat task
    const now = new Date();
    const newTask: AgentTask = {
      id: `task-${Date.now()}`,
      title: 'New conversation',
      description: 'Start chatting with the agent',
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };

    // Add new task to the beginning of the list
    setAgentTasks([newTask, ...agentTasks]);

    // Select the new task
    setSelectedTask(newTask);

    // Close all tasks page if open
    setShowAllTasksPage(false);
  };

  // Show all tasks
  const displayTasks = agentTasks;

  // Get current messages for the selected task
  const currentMessages = getTaskMessages(selectedTask.id);

  // Get status styles
  const getStatusStyles = (status: AgentTask['status']) => {
    switch (status) {
      case 'new':
        return { bg: 'bg-sky-400', ring: 'ring-sky-400/30', text: 'text-sky-600' };
      case 'in-progress':
        return { bg: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-600' };
      case 'awaiting-user':
        return { bg: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-600' };
      case 'error':
        return { bg: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600' };
      case 'completed':
        return { bg: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-600' };
    }
  };

  // Render task history page
  if (showAllTasksPage) {
    // Filter out empty "New conversation" tasks from history
    const historyTasks = displayTasks.filter(
      (task) => !(task.title === 'New conversation' && task.status === 'new')
    );

    return (
      <div className="fixed right-0 top-0 bottom-0 w-1/3 bg-card border-l border-border flex flex-col">
        {/* Header with back button */}
        <div className="h-16 px-6 border-b border-border flex items-center gap-4">
          <button
            onClick={() => setShowAllTasksPage(false)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Task History</h3>
            <p className="text-xs text-muted-foreground">{historyTasks.length} total tasks</p>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {historyTasks.map((task) => {
            const letter = task.title.charAt(0).toUpperCase();
            const style = getStatusStyles(task.status);

            return (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Task icon */}
                  <div
                    className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}
                  >
                    {task.status === 'completed' ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : task.status === 'error' ? (
                      <X className="w-5 h-5 text-white" />
                    ) : task.status === 'awaiting-user' ? (
                      <>
                        <span className="text-white text-sm font-semibold">{letter}</span>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}
                        >
                          <HelpCircle className="w-2.5 h-2.5 text-white" />
                        </div>
                      </>
                    ) : (
                      <span className="text-white text-sm font-semibold">{letter}</span>
                    )}

                    {task.status === 'in-progress' && (
                      <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    )}

                    {task.status === 'awaiting-user' && (
                      <div
                        className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`}
                      />
                    )}
                  </div>

                  {/* Task content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground mb-1">{task.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>

                    {/* Status and time */}
                    <div className="flex items-center gap-3 text-xs">
                      <div className={`${style.text}`}>
                        <span>{getStatusText(task.status)}</span>
                      </div>
                      <div className="text-muted-foreground">
                        <span>·</span>
                        <span className="ml-1.5">
                          {/* Requirements: ui.11.2, ui.11.5 - Use DateTimeFormatter for system locale formatting */}
                          {DateTimeFormatter.formatDateTime(task.createdAt.getTime())}
                        </span>
                      </div>
                    </div>

                    {/* Error message if present */}
                    {task.errorMessage && (
                      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600">
                        {task.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Regular chat view - always showing a task chat
  const letter = selectedTask.title.charAt(0).toUpperCase();
  const style = getStatusStyles(selectedTask.status);

  return (
    <div className="fixed right-0 top-0 bottom-0 w-1/3 bg-card border-l border-border flex flex-col">
      {/* Header - same height as menu (h-16) */}
      <div className="h-16 px-6 border-b border-border flex items-center gap-3">
        {/* Task icon */}
        <div
          className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}
        >
          {selectedTask.status === 'completed' ? (
            <Check className="w-5 h-5 text-white" />
          ) : selectedTask.status === 'error' ? (
            <X className="w-5 h-5 text-white" />
          ) : selectedTask.status === 'awaiting-user' ? (
            <>
              <span className="text-white text-sm font-semibold">{letter}</span>
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}
              >
                <HelpCircle className="w-2.5 h-2.5 text-white" />
              </div>
            </>
          ) : (
            <span className="text-white text-sm font-semibold">{letter}</span>
          )}

          {selectedTask.status === 'in-progress' && (
            <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
          )}

          {selectedTask.status === 'awaiting-user' && (
            <div className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`} />
          )}
        </div>

        {/* Task title, status and timestamp */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{selectedTask.title}</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className={`${style.text}`}>{getStatusText(selectedTask.status)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {/* Requirements: ui.11.2, ui.11.5 - Use DateTimeFormatter for system locale formatting */}
              {DateTimeFormatter.formatDateTime(selectedTask.createdAt.getTime())}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Tasks as Icons - separate row, full width */}
      <div className="px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 justify-end">
          {/* New chat button - ALWAYS FIRST, light blue */}
          <div
            onClick={handleNewChat}
            className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500 transition-colors group"
            title="New chat"
          >
            <Plus className="w-4 h-4 text-white" />
          </div>

          {/* Show tasks with all 5 different statuses in short list */}
          {displayTasks.slice(0, 5).map((task) => {
            const taskLetter = task.title.charAt(0).toUpperCase();
            const taskStyle = getStatusStyles(task.status);
            const isSelected = task.id === selectedTask.id;

            return (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className={`relative w-8 h-8 rounded-full ${taskStyle.bg} flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                title={task.title}
              >
                {task.status === 'completed' ? (
                  <Check className="w-4 h-4 text-white" />
                ) : task.status === 'error' ? (
                  <X className="w-4 h-4 text-white" />
                ) : task.status === 'awaiting-user' ? (
                  <>
                    <span className="text-white text-xs font-semibold">{taskLetter}</span>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${taskStyle.bg} border-2 border-card flex items-center justify-center`}
                    >
                      <HelpCircle className="w-2 h-2 text-white" />
                    </div>
                  </>
                ) : (
                  <span className="text-white text-xs font-semibold">{taskLetter}</span>
                )}

                {task.status === 'in-progress' && (
                  <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
                )}

                {task.status === 'awaiting-user' && (
                  <div
                    className={`absolute -inset-1 rounded-full ring-2 ${taskStyle.ring} animate-pulse`}
                  />
                )}

                {/* Tooltip on hover */}
                <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg">
                  <p className="font-semibold mb-1">{task.title}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-300">
                    <span>{getStatusText(task.status)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {displayTasks.length > 5 && (
            <div
              onClick={() => setShowAllTasksPage(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
            >
              +{displayTasks.length - 5}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area - always shows current task messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {currentMessages.map((message, index) => {
          // Check if we should show the agent avatar
          // Show it only if this is the first message or the previous message was from user
          const showAvatar =
            message.type === 'agent' && (index === 0 || currentMessages[index - 1].type === 'user');

          return (
            <div key={message.id}>
              {message.type === 'user' ? (
                <div className="flex justify-end">
                  <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-3">
                    <p className="text-sm leading-relaxed text-foreground text-right">
                      {message.content}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Agent avatar above first message in sequence */}
                  {showAvatar && (
                    <div className="mb-2">
                      <Logo
                        size="sm"
                        showText={false}
                        animated={selectedTask.status === 'in-progress'}
                      />
                    </div>
                  )}
                  {/* Agent message content */}
                  <div className="max-w-[85%] text-sm leading-relaxed text-foreground">
                    {message.content}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - always for current task */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask, reply, or give command..."
            className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={!taskInput.trim()}
            className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-0.5">Press Enter to send</p>
      </div>
    </div>
  );
}
