import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Loader2,
  AlertCircle,
  Check,
  X,
  HelpCircle,
  ArrowLeft,
  CheckSquare,
  Plus,
  FileText,
  Calendar,
  Video,
  User,
} from 'lucide-react';
import { Logo } from './logo';
import type { AgentTask } from '../types/agent-task';

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
  const chatListRef = useRef<HTMLDivElement>(null);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when task changes
  useEffect(() => {
    scrollToBottom();
  }, [selectedTask]);

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

  const handleSend = () => {
    if (!taskInput.trim()) return;

    // Handle sending message for current task
    console.log('Command:', taskInput);
    setTaskInput('');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
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
        {
          id: 't1-2',
          type: 'agent',
          content:
            'I can help you with pricing information for enterprise customers. Let me pull up the current pricing tiers.',
          timestamp: new Date('2026-02-02T15:00:15'),
        },
        {
          id: 't1-3',
          type: 'agent',
          content: (
            <div className="space-y-3">
              <p>Here are our enterprise pricing options:</p>
              <div className="space-y-2">
                <div className="p-3 bg-secondary/50 rounded-lg border border-border">
                  <p className="font-medium text-sm mb-1">Professional Plan</p>
                  <p className="text-xs text-muted-foreground">$99/user/month - Up to 50 users</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded-lg border border-border">
                  <p className="font-medium text-sm mb-1">Business Plan</p>
                  <p className="text-xs text-muted-foreground">$149/user/month - 51-200 users</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded-lg border border-border">
                  <p className="font-medium text-sm mb-1">Enterprise Plan</p>
                  <p className="text-xs text-muted-foreground">Custom pricing - 200+ users</p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T15:00:30'),
        },
        {
          id: 't1-4',
          type: 'user',
          content: 'What features are included in the Enterprise plan?',
          timestamp: new Date('2026-02-02T15:01:00'),
        },
        {
          id: 't1-5',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>The Enterprise plan includes all features from lower tiers, plus:</p>
              <ul className="space-y-1.5 mt-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Unlimited meeting transcriptions</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Advanced AI task extraction and categorization</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Custom integrations (Jira, Asana, Linear, Monday.com)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>SSO and advanced security features</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Dedicated account manager</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>24/7 priority support</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Custom SLA agreements</span>
                </li>
              </ul>
            </div>
          ),
          timestamp: new Date('2026-02-02T15:01:20'),
        },
        {
          id: 't1-6',
          type: 'user',
          content: 'Can we get a volume discount for 500 users?',
          timestamp: new Date('2026-02-02T15:02:00'),
        },
        {
          id: 't1-7',
          type: 'agent',
          content:
            'Absolutely! For 500 users, we typically offer significant volume discounts. The exact pricing would be customized based on your needs, but you can expect 20-35% off the standard per-user rate.',
          timestamp: new Date('2026-02-02T15:02:15'),
        },
        {
          id: 't1-8',
          type: 'user',
          content: 'What about data residency options?',
          timestamp: new Date('2026-02-02T15:02:45'),
        },
        {
          id: 't1-9',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>We offer flexible data residency options for Enterprise customers:</p>
              <ul className="space-y-1.5 mt-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>US (East & West regions)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>EU (Frankfurt, Ireland)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>Asia Pacific (Singapore, Sydney)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>UK (London)</span>
                </li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                All data is encrypted at rest and in transit. We're SOC 2 Type II and GDPR
                compliant.
              </p>
            </div>
          ),
          timestamp: new Date('2026-02-02T15:03:00'),
        },
        {
          id: 't1-10',
          type: 'user',
          content: 'How long does implementation typically take?',
          timestamp: new Date('2026-02-02T15:03:30'),
        },
        {
          id: 't1-11',
          type: 'agent',
          content:
            'For a 500-user enterprise deployment, typical implementation timeline is 2-4 weeks, depending on integration complexity. This includes SSO setup, custom integrations, team training, and onboarding support.',
          timestamp: new Date('2026-02-02T15:03:45'),
        },
        {
          id: 't1-12',
          type: 'user',
          content: 'Can you send me a detailed proposal?',
          timestamp: new Date('2026-02-02T15:04:15'),
        },
        {
          id: 't1-13',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>I'll prepare a customized proposal for you. I'll need a few more details:</p>
              <ul className="space-y-1.5 mt-2 text-sm list-disc list-inside text-muted-foreground">
                <li>Company name and industry</li>
                <li>Estimated number of users (you mentioned 500)</li>
                <li>Preferred data residency region</li>
                <li>Key integrations needed (Jira, Slack, etc.)</li>
                <li>Any specific compliance requirements</li>
              </ul>
              <p className="mt-3">
                Once I have these details, I can send you a comprehensive proposal within 24 hours.
              </p>
            </div>
          ),
          timestamp: new Date('2026-02-02T15:04:30'),
        },
        {
          id: 't1-14',
          type: 'user',
          content:
            'Company: TechCorp International, Fintech industry, 500 users, EU data residency, need Jira and Slack integrations, ISO 27001 compliance required',
          timestamp: new Date('2026-02-02T15:05:00'),
        },
        {
          id: 't1-15',
          type: 'agent',
          content: (
            <div className="space-y-3">
              <p>
                Perfect! Thank you for the details. I'm creating a proposal for TechCorp
                International with the following specifications:
              </p>
              <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company:</span>
                  <span className="font-medium">TechCorp International</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Industry:</span>
                  <span className="font-medium">Fintech</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Users:</span>
                  <span className="font-medium">500</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data Region:</span>
                  <span className="font-medium">EU (Frankfurt/Ireland)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Integrations:</span>
                  <span className="font-medium">Jira, Slack</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Compliance:</span>
                  <span className="font-medium">ISO 27001</span>
                </div>
              </div>
              <p>
                I'll have a detailed proposal with pricing, implementation timeline, and compliance
                documentation sent to you within 24 hours. Is there anything else you'd like me to
                include?
              </p>
            </div>
          ),
          timestamp: new Date('2026-02-02T15:05:30'),
        },
      ],
      'task-2': [
        {
          id: 't2-1',
          type: 'user',
          content: 'Transcribe the Product Roadmap Review meeting and extract all action items',
          timestamp: new Date('2026-02-02T14:29:00'),
        },
        {
          id: 't2-2',
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
                  <p className="text-xs text-muted-foreground">
                    Audio duration: 45 minutes · 6 participants
                  </p>
                </div>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T14:30:00'),
        },
        {
          id: 't2-3',
          type: 'user',
          content: 'How many action items have you found so far?',
          timestamp: new Date('2026-02-02T14:33:00'),
        },
        {
          id: 't2-4',
          type: 'agent',
          content: (
            <div className="space-y-2">
              <p>
                I've identified <strong>8 action items</strong> so far from the first 15 minutes:
              </p>
              <div className="mt-3 space-y-2 pl-3 border-l-2 border-primary/30">
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Sarah Chen</p>
                  <p>Review API authentication flow by Friday</p>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Alex Kumar</p>
                  <p>Schedule design critique for mobile redesign</p>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Maria Santos</p>
                  <p>Update Jira roadmap with Q2 priorities</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  + 5 more items being processed...
                </p>
              </div>
            </div>
          ),
          timestamp: new Date('2026-02-02T14:33:30'),
        },
        {
          id: 't2-5',
          type: 'agent',
          content: 'Still processing the meeting audio and analyzing context...',
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
                          {task.createdAt.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
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
    <div data-testid="agents" className="h-[calc(100vh-4rem)] bg-card flex flex-col">
      {/* Combined Header with Chat List */}
      <div className="h-16 px-6 border-b border-border flex items-center gap-6 flex-shrink-0">
        {/* Left: Task Title - 50% */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
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
              <div
                className={`absolute -inset-1 rounded-full ring-2 ${style.ring} animate-pulse`}
              />
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
                  minute: '2-digit',
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
          {displayTasks.slice(0, visibleChatsCount).map((task) => {
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
      <div className="p-4 border-t border-border bg-card flex-shrink-0">
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
