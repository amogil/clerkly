import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, Check, X, HelpCircle, ArrowLeft, CheckSquare, Plus, FileText, Calendar, Video, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './logo';
import type { AgentTask } from '@/app/types/agent-task';

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string | React.ReactNode;
  timestamp: Date;
}

export function Agents() {
  const [showAllTasksPage, setShowAllTasksPage] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [visibleChatsCount, setVisibleChatsCount] = useState(5);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Store messages for each task
  const [taskMessagesMap, setTaskMessagesMap] = useState<Record<string, Message[]>>({
    'task-1': [
      {
        id: 'msg-task-1-1',
        type: 'agent',
        content: 'Hi! I noticed you have a question about pricing. How can I help you?',
        timestamp: new Date('2026-02-12T15:00:00'),
      }
    ],
    'task-2': [
      {
        id: 'msg-task-2-1',
        type: 'agent',
        content: 'I\'m currently transcribing your meeting audio. This usually takes a few minutes depending on the length...',
        timestamp: new Date('2026-02-12T14:30:00'),
      }
    ],
    'task-3': [
      {
        id: 'msg-task-3-1',
        type: 'agent',
        content: 'I found 5 action items from your meeting. Which Jira project should I create these tasks in?',
        timestamp: new Date('2026-02-12T11:20:00'),
      },
      {
        id: 'msg-task-3-2',
        type: 'agent',
        content: 'Available projects:\n• PROD - Product Development\n• ENG - Engineering\n• DESIGN - Design Team',
        timestamp: new Date('2026-02-12T11:21:00'),
      }
    ],
    'task-4': [
      {
        id: 'msg-task-4-1',
        type: 'agent',
        content: 'I tried to send your weekly report via email but the connection timed out.',
        timestamp: new Date('2026-02-12T08:00:00'),
      },
      {
        id: 'msg-task-4-2',
        type: 'agent',
        content: 'Error: Connection timeout after 30 seconds. Would you like me to try again?',
        timestamp: new Date('2026-02-12T08:05:00'),
      }
    ],
    'task-5': [
      {
        id: 'msg-task-5-1',
        type: 'agent',
        content: 'I\'ve successfully sent the meeting summary to all participants. The summary includes key discussion points and 3 action items.',
        timestamp: new Date('2026-02-12T09:15:00'),
      }
    ],
  });
  
  // Agent tasks data - examples of all statuses
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([
    {
      id: 'task-1',
      title: 'Question about pricing',
      description: 'New conversation started',
      status: 'new',
      createdAt: new Date('2026-02-12T15:00:00'),
      updatedAt: new Date('2026-02-12T15:00:00'),
    },
    {
      id: 'task-2',
      title: 'Transcribing meeting',
      description: 'Processing audio from meeting',
      status: 'in-progress',
      createdAt: new Date('2026-02-12T14:30:00'),
      updatedAt: new Date('2026-02-12T14:35:00'),
    },
    {
      id: 'task-3',
      title: 'Which Jira project?',
      description: 'Need to select project',
      status: 'awaiting-user',
      createdAt: new Date('2026-02-12T11:20:00'),
      updatedAt: new Date('2026-02-12T11:25:00'),
    },
    {
      id: 'task-4',
      title: 'Email connection failed',
      description: 'Failed to send report',
      status: 'error',
      createdAt: new Date('2026-02-12T08:00:00'),
      updatedAt: new Date('2026-02-12T08:05:00'),
      errorMessage: 'Connection timeout',
    },
    {
      id: 'task-5',
      title: 'Meeting summary sent',
      description: 'Summary sent successfully',
      status: 'completed',
      createdAt: new Date('2026-02-12T09:00:00'),
      updatedAt: new Date('2026-02-12T09:15:00'),
      completedAt: new Date('2026-02-12T09:15:00'),
    },
    {
      id: 'task-6',
      title: 'Extract action items',
      description: 'Analyzing meeting transcript',
      status: 'completed',
      createdAt: new Date('2026-02-11T16:00:00'),
      updatedAt: new Date('2026-02-11T16:10:00'),
      completedAt: new Date('2026-02-11T16:10:00'),
    },
    {
      id: 'task-7',
      title: 'Sprint planning notes',
      description: 'Processing sprint planning session',
      status: 'in-progress',
      createdAt: new Date('2026-02-11T10:30:00'),
      updatedAt: new Date('2026-02-11T10:45:00'),
    },
    {
      id: 'task-8',
      title: 'Create Jira tickets',
      description: 'Creating tickets from standup',
      status: 'completed',
      createdAt: new Date('2026-02-10T09:00:00'),
      updatedAt: new Date('2026-02-10T09:20:00'),
      completedAt: new Date('2026-02-10T09:20:00'),
    },
    {
      id: 'task-9',
      title: 'Slack integration setup',
      description: 'Need permission approval',
      status: 'awaiting-user',
      createdAt: new Date('2026-02-09T14:00:00'),
      updatedAt: new Date('2026-02-09T14:05:00'),
    },
    {
      id: 'task-10',
      title: 'API rate limit exceeded',
      description: 'Failed to fetch calendar events',
      status: 'error',
      createdAt: new Date('2026-02-09T11:30:00'),
      updatedAt: new Date('2026-02-09T11:35:00'),
      errorMessage: 'Rate limit exceeded, retry in 15 minutes',
    },
    {
      id: 'task-11',
      title: 'Weekly report generated',
      description: 'Report sent to stakeholders',
      status: 'completed',
      createdAt: new Date('2026-02-08T16:00:00'),
      updatedAt: new Date('2026-02-08T16:15:00'),
      completedAt: new Date('2026-02-08T16:15:00'),
    },
    {
      id: 'task-12',
      title: 'Design review feedback',
      description: 'Analyzing meeting feedback',
      status: 'in-progress',
      createdAt: new Date('2026-02-08T13:00:00'),
      updatedAt: new Date('2026-02-08T13:20:00'),
    },
    {
      id: 'task-13',
      title: 'Choose task list',
      description: 'Which Google Tasks list?',
      status: 'awaiting-user',
      createdAt: new Date('2026-02-07T15:30:00'),
      updatedAt: new Date('2026-02-07T15:35:00'),
    },
    {
      id: 'task-14',
      title: 'Customer call summary',
      description: 'Transcription and summary complete',
      status: 'completed',
      createdAt: new Date('2026-02-07T11:00:00'),
      updatedAt: new Date('2026-02-07T11:45:00'),
      completedAt: new Date('2026-02-07T11:45:00'),
    },
    {
      id: 'task-15',
      title: 'Analyzing Q1 metrics',
      description: 'Generating insights report',
      status: 'in-progress',
      createdAt: new Date('2026-02-06T10:00:00'),
      updatedAt: new Date('2026-02-06T10:30:00'),
    },
    {
      id: 'task-16',
      title: 'Failed to sync calendar',
      description: 'Google Calendar API error',
      status: 'error',
      createdAt: new Date('2026-02-06T08:00:00'),
      updatedAt: new Date('2026-02-06T08:05:00'),
      errorMessage: 'Authentication token expired',
    },
    {
      id: 'task-17',
      title: 'Roadmap presentation',
      description: 'Summary shared with team',
      status: 'completed',
      createdAt: new Date('2026-02-05T14:00:00'),
      updatedAt: new Date('2026-02-05T14:45:00'),
      completedAt: new Date('2026-02-05T14:45:00'),
    },
    {
      id: 'task-18',
      title: 'Confirm assignees',
      description: 'Who should be assigned to tasks?',
      status: 'awaiting-user',
      createdAt: new Date('2026-02-05T09:30:00'),
      updatedAt: new Date('2026-02-05T09:35:00'),
    },
  ]);

  // Current selected task - default to first task
  const [selectedTask, setSelectedTask] = useState<AgentTask>(agentTasks[0]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Get messages for specific task
  const getTaskMessages = (taskId: string): Message[] => {
    return taskMessagesMap[taskId] || [];
  };

  // Get current messages for the selected task
  const currentMessages = getTaskMessages(selectedTask.id);

  // Calculate visible chats based on container width
  useEffect(() => {
    const calculateVisibleChats = () => {
      if (!chatListRef.current) return;
      
      const containerWidth = chatListRef.current.offsetWidth;
      // Each chat icon is 32px (w-8) + 8px gap = 40px
      // New chat button is also 40px
      // +N button is also 40px
      // Reserve space for new chat button and +N button: 80px
      const availableWidth = containerWidth - 80;
      const chatWidth = 40; // 32px icon + 8px gap
      const maxChats = Math.floor(availableWidth / chatWidth);
      
      // Show at least 1, no maximum limit
      setVisibleChatsCount(Math.max(1, maxChats));
    };

    calculateVisibleChats();
    window.addEventListener('resize', calculateVisibleChats);
    
    return () => window.removeEventListener('resize', calculateVisibleChats);
  }, []);

  // Simulate agent updates to demonstrate animation
  useEffect(() => {
    const interval = setInterval(() => {
      // Pick a random task that's not the first one
      const tasksToUpdate = agentTasks.slice(1);
      if (tasksToUpdate.length === 0) return;
      
      const randomTask = tasksToUpdate[Math.floor(Math.random() * tasksToUpdate.length)];
      
      // Update the task's updatedAt to move it to the front
      setAgentTasks(prev => 
        prev.map(task => 
          task.id === randomTask.id 
            ? { ...task, updatedAt: new Date() }
            : task
        )
      );
    }, 8000); // Every 8 seconds

    return () => clearInterval(interval);
  }, [agentTasks]);

  const handleSend = () => {
    if (!taskInput.trim()) return;
    
    // Create new user message
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: taskInput,
      timestamp: new Date(),
    };
    
    // Add message to current task's messages
    setTaskMessagesMap(prev => ({
      ...prev,
      [selectedTask.id]: [...(prev[selectedTask.id] || []), newMessage],
    }));
    
    // Clear input
    setTaskInput('');
    
    // Show typing indicator
    setIsAgentTyping(true);
    
    // Simulate agent response after 2 seconds
    setTimeout(() => {
      setIsAgentTyping(false);
      
      // Add mock agent response
      const agentResponse: Message = {
        id: `msg-agent-${Date.now()}`,
        type: 'agent',
        content: 'Got it! I\'m processing your request...',
        timestamp: new Date(),
      };
      
      setTaskMessagesMap(prev => ({
        ...prev,
        [selectedTask.id]: [...(prev[selectedTask.id] || []), agentResponse],
      }));
      
      // Update the task's updatedAt to move it to the front
      setAgentTasks(prev =>
        prev.map(task =>
          task.id === selectedTask.id
            ? { ...task, updatedAt: new Date() }
            : task
        )
      );
    }, 2000);
  };

  const handlePromptClick = (prompt: string) => {
    setTaskInput(prompt);
    // Small delay to show the input before sending
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'new':
        return <Plus className="w-3.5 h-3.5 text-sky-500" />;
      case 'in-progress':
        return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'awaiting-user':
        return <HelpCircle className="w-3.5 h-3.5 text-amber-500" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'completed':
        return <CheckSquare className="w-3.5 h-3.5 text-green-500" />;
    }
  };

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
  const displayTasks = [...agentTasks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

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
    const historyTasks = displayTasks.filter(task => 
      !(task.title === 'New conversation' && task.status === 'new')
    );

    return (
      <div className="h-[calc(100vh-4rem)] bg-card flex flex-col">
        {/* Header with back button */}
        <div className="h-16 px-6 border-b border-border flex items-center gap-4 flex-shrink-0">
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
                  <div className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}>
                    {task.status === 'completed' ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : task.status === 'error' ? (
                      <X className="w-5 h-5 text-white" />
                    ) : task.status === 'awaiting-user' ? (
                      <>
                        <span className="text-white text-sm font-semibold">{letter}</span>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}>
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
                      <div className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`} />
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
                          {task.createdAt.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
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
    <div className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      {/* Combined Header with Chat List */}
      <div className="h-16 px-6 border-b border-border flex items-center gap-6 flex-shrink-0">
        {/* Left: Task Title - 50% */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {/* Task icon */}
          <div className={`relative flex-shrink-0 w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}>
            {selectedTask.status === 'completed' ? (
              <Check className="w-5 h-5 text-white" />
            ) : selectedTask.status === 'error' ? (
              <X className="w-5 h-5 text-white" />
            ) : selectedTask.status === 'awaiting-user' ? (
              <>
                <span className="text-white text-sm font-semibold">{letter}</span>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${style.bg} border-2 border-card flex items-center justify-center`}>
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
              <span className="text-muted-foreground truncate">
                {selectedTask.createdAt.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Chat List - 50% */}
        <div ref={chatListRef} className="flex-1 flex items-center gap-2 justify-end">
          {/* New chat button - ALWAYS FIRST, light blue */}
          <div
            onClick={handleNewChat}
            className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center cursor-pointer hover:bg-sky-500 transition-colors group"
            title="New chat"
          >
            <Plus className="w-4 h-4 text-white" />
          </div>
          
          {/* Show dynamic number of tasks based on available space */}
          <AnimatePresence mode="popLayout">
            {displayTasks.slice(0, visibleChatsCount).map((task) => {
              const taskLetter = task.title.charAt(0).toUpperCase();
              const taskStyle = getStatusStyles(task.status);
              const isSelected = task.id === selectedTask.id;

              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    layout: {
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                      mass: 0.8
                    },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 }
                  }}
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
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${taskStyle.bg} border-2 border-card flex items-center justify-center`}>
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
                    <div className={`absolute -inset-1 rounded-full ring-2 ${taskStyle.ring} animate-pulse`} />
                  )}
                  
                  {/* Tooltip on hover */}
                  <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg">
                    <p className="font-semibold mb-1">{task.title}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-300">
                      <span>{getStatusText(task.status)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {displayTasks.length > visibleChatsCount && (
            <div
              onClick={() => setShowAllTasksPage(true)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
            >
              +{displayTasks.length - visibleChatsCount}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area - always shows current task messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 min-h-0">
        <div className="min-h-full flex flex-col justify-end space-y-4">
          {/* Empty state with prompt suggestions */}
          {currentMessages.length === 0 && !isAgentTyping && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center justify-center space-y-8 py-12"
            >
              {/* Logo and title */}
              <div className="text-center space-y-3">
                <div className="flex justify-center">
                  <Logo size="lg" animated={true} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    Поручите что-нибудь агенту
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Транскрибирует встречи, извлекает задачи, создает тикеты в Jira
                  </p>
                </div>
              </div>

              {/* Prompt suggestions grid */}
              <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    icon: <Video className="w-4 h-4" />,
                    prompt: "Transcribe my latest meeting"
                  },
                  {
                    icon: <CheckSquare className="w-4 h-4" />,
                    prompt: "Extract action items from today's standup"
                  },
                  {
                    icon: <FileText className="w-4 h-4" />,
                    prompt: "Create Jira tickets from meeting notes"
                  },
                  {
                    icon: <Calendar className="w-4 h-4" />,
                    prompt: "Send summary to the team"
                  }
                ].map((item, index) => (
                  <motion.button
                    key={index}
                    onClick={() => handlePromptClick(item.prompt)}
                    className="group flex items-center gap-3 p-4 bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 rounded-xl transition-all text-left"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {item.icon}
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {item.prompt}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {currentMessages.map((message, index) => {
            // Check if we should show the agent avatar
            // Show it only if this is the first message or the previous message was from user
            const showAvatar = message.type === 'agent' && (index === 0 || currentMessages[index - 1].type === 'user');
            
            return (
              <motion.div 
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.3,
                  ease: [0.4, 0, 0.2, 1]
                }}
              >
                {message.type === 'user' ? (
                  <div className="flex justify-end">
                    <div className="rounded-2xl bg-secondary/70 border border-border px-4 py-3 max-w-[75%]">
                      <p className="text-sm leading-relaxed text-foreground">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Agent avatar above first message in sequence */}
                    {showAvatar && (
                      <div className="mb-2">
                        <Logo size="sm" showText={false} animated={selectedTask.status === 'in-progress'} />
                      </div>
                    )}
                    {/* Agent message content */}
                    <div className="max-w-[85%] text-sm leading-relaxed text-foreground">
                      {message.content}
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
          
          {/* Typing indicator */}
          {isAgentTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-3">
                <Logo size="sm" showText={false} animated={true} />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input Area - always for current task */}
      <div className="p-4 border-t border-border bg-card flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask, reply, or give command..."
            className="flex-1 px-3.5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-y-auto max-h-[120px]"
            style={{ height: 'auto', minHeight: '42px' }}
          />
          <motion.button
            onClick={handleSend}
            disabled={!taskInput.trim()}
            className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}