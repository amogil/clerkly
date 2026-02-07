import React, { useState } from 'react';
import {
  Plus,
  Zap,
  X,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Trigger, TriggerEventType } from '../types/trigger';
import { triggerEventLabels, triggerEventDescriptions } from '../types/trigger';

const mockTriggers: Trigger[] = [
  {
    id: '1',
    name: 'Extract Meeting Action Items',
    description: 'Automatically extracts action items from meeting transcripts and creates tasks',
    eventType: 'meeting_ended',
    prompt:
      'Analyze the meeting transcript and extract all action items. For each action item, create a task in the "Work" task list with the person responsible mentioned in the notes.',
    enabled: true,
    executions: Array.from({ length: 50 }, (_, i) => ({
      id: `e1-${i}`,
      timestamp: new Date(Date.now() - i * 3600000 * 4), // Every 4 hours going back
      chatId: `chat-${String(i + 1).padStart(3, '0')}`,
      status: (i % 7 === 0 ? 'failed' : 'success') as 'success' | 'failed',
    })),
    createdAt: new Date('2026-01-20'),
    updatedAt: new Date('2026-01-20'),
  },
  {
    id: '2',
    name: 'Daily Task Summary',
    description: 'Provides a prioritized summary of tasks due today every morning',
    eventType: 'daily_summary',
    prompt:
      'Review all tasks that are due today and provide a prioritized summary with time estimates. Highlight any overdue tasks.',
    enabled: true,
    executions: [
      {
        id: 'e4',
        timestamp: new Date('2026-02-05T09:00:00'),
        chatId: 'chat-004',
        status: 'success',
      },
      {
        id: 'e5',
        timestamp: new Date('2026-02-04T09:00:00'),
        chatId: 'chat-005',
        status: 'success',
      },
      {
        id: 'e6',
        timestamp: new Date('2026-02-03T09:00:00'),
        chatId: 'chat-006',
        status: 'failed',
      },
      {
        id: 'e7',
        timestamp: new Date('2026-02-02T09:00:00'),
        chatId: 'chat-007',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-01-22'),
    updatedAt: new Date('2026-01-25'),
  },
  {
    id: '3',
    name: 'Overdue Task Reminder',
    description: 'Sends notifications for overdue tasks with rescheduling suggestions',
    eventType: 'task_overdue',
    prompt:
      'Send a notification about the overdue task and suggest rescheduling options based on my calendar availability.',
    enabled: false,
    executions: [
      {
        id: 'e13',
        timestamp: new Date('2026-02-01T10:00:00'),
        chatId: 'chat-013',
        status: 'success',
      },
      {
        id: 'e14',
        timestamp: new Date('2026-01-31T14:30:00'),
        chatId: 'chat-014',
        status: 'success',
      },
      {
        id: 'e15',
        timestamp: new Date('2026-01-30T09:15:00'),
        chatId: 'chat-015',
        status: 'failed',
      },
      {
        id: 'e16',
        timestamp: new Date('2026-01-29T16:20:00'),
        chatId: 'chat-016',
        status: 'success',
      },
      {
        id: 'e17',
        timestamp: new Date('2026-01-28T11:00:00'),
        chatId: 'chat-017',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-01-18'),
    updatedAt: new Date('2026-01-18'),
  },
  {
    id: '4',
    name: 'Send Meeting Summary via Email',
    description: 'Creates and emails meeting summaries to all participants',
    eventType: 'meeting_ended',
    prompt:
      'Create a concise meeting summary including key decisions, action items, and next steps. Send this summary via email to all meeting participants within 10 minutes of meeting end.',
    enabled: true,
    executions: [
      {
        id: 'e8',
        timestamp: new Date('2026-02-05T11:20:00'),
        chatId: 'chat-008',
        status: 'success',
      },
      {
        id: 'e9',
        timestamp: new Date('2026-02-04T15:40:00'),
        chatId: 'chat-009',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-01-28'),
    updatedAt: new Date('2026-02-01'),
  },
  {
    id: '5',
    name: 'Weekly Planning Email',
    description: 'Compiles weekly reports with tasks, meetings, and priorities',
    eventType: 'weekly_summary',
    prompt:
      'Compile a weekly report with: completed tasks, upcoming deadlines, scheduled meetings, and suggested priorities for the week. Email this to me every Monday at 9 AM.',
    enabled: true,
    executions: [
      {
        id: 'e10',
        timestamp: new Date('2026-02-03T09:00:00'),
        chatId: 'chat-010',
        status: 'success',
      },
      {
        id: 'e11',
        timestamp: new Date('2026-01-27T09:00:00'),
        chatId: 'chat-011',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-29'),
  },
  {
    id: '6',
    name: 'New Contact Welcome Flow',
    description: 'Creates follow-up tasks for new contacts with introduction emails',
    eventType: 'contact_added',
    prompt:
      'When a new contact is added, create a follow-up task to send an introduction email within 24 hours. Include relevant context from recent meetings if available.',
    enabled: false,
    executions: [
      {
        id: 'e18',
        timestamp: new Date('2026-02-02T13:45:00'),
        chatId: 'chat-018',
        status: 'success',
      },
      {
        id: 'e19',
        timestamp: new Date('2026-02-01T10:30:00'),
        chatId: 'chat-019',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-01-30'),
    updatedAt: new Date('2026-02-02'),
  },
  {
    id: '7',
    name: 'Task Completion Notification',
    description: 'Sends progress updates to stakeholders when tasks are completed',
    eventType: 'task_completed',
    prompt:
      'When a task is completed, check if it was part of a larger project. If yes, send a progress update email to stakeholders and suggest the next task in the sequence.',
    enabled: true,
    executions: [
      {
        id: 'e12',
        timestamp: new Date('2026-02-05T13:10:00'),
        chatId: 'chat-012',
        status: 'success',
      },
    ],
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-04'),
  },
];

export function Triggers() {
  const [triggers, setTriggers] = useState<Trigger[]>(mockTriggers);
  const [showNewTriggerModal, setShowNewTriggerModal] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [newTriggerName, setNewTriggerName] = useState('');
  const [newTriggerDescription, setNewTriggerDescription] = useState('');
  const [newTriggerEvent, setNewTriggerEvent] = useState<TriggerEventType>('meeting_ended');
  const [newTriggerPrompt, setNewTriggerPrompt] = useState('');
  const [deleteConfirmTrigger, setDeleteConfirmTrigger] = useState<Trigger | null>(null);
  const [expandedExecutions, setExpandedExecutions] = useState<Record<string, boolean>>({});

  const handleToggleTrigger = (id: string) => {
    setTriggers(
      triggers.map((trigger) =>
        trigger.id === id
          ? { ...trigger, enabled: !trigger.enabled, updatedAt: new Date() }
          : trigger
      )
    );
  };

  const handleDeleteTrigger = (id: string) => {
    setTriggers(triggers.filter((trigger) => trigger.id !== id));
  };

  const handleEditTrigger = (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setNewTriggerName(trigger.name);
    setNewTriggerDescription(trigger.description);
    setNewTriggerEvent(trigger.eventType);
    setNewTriggerPrompt(trigger.prompt);
    setShowNewTriggerModal(true);
  };

  const handleSaveTrigger = () => {
    if (!newTriggerName.trim() || !newTriggerPrompt.trim()) return;

    if (editingTrigger) {
      setTriggers(
        triggers.map((trigger) =>
          trigger.id === editingTrigger.id
            ? {
                ...trigger,
                name: newTriggerName,
                description: newTriggerDescription,
                eventType: newTriggerEvent,
                prompt: newTriggerPrompt,
                updatedAt: new Date(),
              }
            : trigger
        )
      );
    } else {
      const newTrigger: Trigger = {
        id: Date.now().toString(),
        name: newTriggerName,
        description: newTriggerDescription,
        eventType: newTriggerEvent,
        prompt: newTriggerPrompt,
        enabled: true,
        executions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setTriggers([...triggers, newTrigger]);
    }

    handleCloseModal();
  };

  const handleCloseModal = () => {
    setShowNewTriggerModal(false);
    setEditingTrigger(null);
    setNewTriggerName('');
    setNewTriggerDescription('');
    setNewTriggerEvent('meeting_ended');
    setNewTriggerPrompt('');
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const eventTypeOptions: TriggerEventType[] = [
    'meeting_started',
    'meeting_ended',
    'task_created',
    'task_completed',
    'task_overdue',
    'contact_added',
    'daily_summary',
    'weekly_summary',
  ];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">Triggers</h1>
            <p className="text-muted-foreground">Run agent actions based on events</p>
          </div>
          <button
            onClick={() => setShowNewTriggerModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Trigger</span>
          </button>
        </div>

        {/* Triggers List */}
        <div className="space-y-4">
          {triggers.length > 0 ? (
            triggers.map((trigger) => (
              <div
                key={trigger.id}
                className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground text-lg">{trigger.name}</h3>
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
                          {triggerEventLabels[trigger.eventType]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{trigger.description}</p>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleEditTrigger(trigger)}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors"
                        title="Edit trigger"
                      >
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmTrigger(trigger)}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors"
                        title="Delete trigger"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                      <button
                        onClick={() => handleToggleTrigger(trigger.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          trigger.enabled
                            ? 'bg-primary/10 hover:bg-primary/20'
                            : 'hover:bg-secondary'
                        }`}
                        title={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
                      >
                        {trigger.enabled ? (
                          <ToggleRight className="w-5 h-5 text-primary" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Prompt */}
                  <div className="bg-secondary/50 rounded-lg p-4 mb-3">
                    <div className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground mb-1">Agent Prompt:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {trigger.prompt}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      <span>Updated {formatDate(trigger.updatedAt)}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        trigger.enabled
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {trigger.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  {/* Executions */}
                  {trigger.executions.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() =>
                          setExpandedExecutions((prev) => ({
                            ...prev,
                            [trigger.id]: !prev[trigger.id],
                          }))
                        }
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        {expandedExecutions[trigger.id] ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        <span>Executions ({trigger.executions.length})</span>
                      </button>
                      {expandedExecutions[trigger.id] && (
                        <div className="mt-2 space-y-2">
                          {trigger.executions.map((execution) => (
                            <a
                              key={execution.id}
                              href={`#/chat/${execution.chatId}`}
                              className="block bg-secondary/30 rounded-lg p-3 hover:bg-secondary/50 transition-colors border border-border/50"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                                  <span className="text-sm text-foreground">
                                    {formatDateTime(execution.timestamp)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {execution.status === 'success' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-500" />
                                  )}
                                  <span
                                    className={`text-xs font-medium ${
                                      execution.status === 'success'
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}
                                  >
                                    {execution.status === 'success' ? 'Success' : 'Failed'}
                                  </span>
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-sm p-16 text-center">
              <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">No triggers yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first trigger to automate agent actions
              </p>
              <button
                onClick={() => setShowNewTriggerModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Trigger</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New/Edit Trigger Modal */}
      {showNewTriggerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h2 className="text-xl font-semibold text-foreground">
                {editingTrigger ? 'Edit Trigger' : 'New Trigger'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Trigger Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Trigger Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Extract Meeting Action Items"
                  value={newTriggerName}
                  onChange={(e) => setNewTriggerName(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  placeholder="Describe what this trigger does..."
                  value={newTriggerDescription}
                  onChange={(e) => setNewTriggerDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* Event Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Event Type</label>
                <select
                  value={newTriggerEvent}
                  onChange={(e) => setNewTriggerEvent(e.target.value as TriggerEventType)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {eventTypeOptions.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {triggerEventLabels[eventType]}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {triggerEventDescriptions[newTriggerEvent]}
                </p>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Agent Prompt
                </label>
                <textarea
                  placeholder="Describe what the agent should do when this event occurs..."
                  value={newTriggerPrompt}
                  onChange={(e) => setNewTriggerPrompt(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  This prompt will be sent to the AI agent when the event is triggered
                </p>
              </div>

              {/* Examples */}
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-2">💡 Example Prompts:</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>
                    • &quot;Extract all action items and create tasks with due dates mentioned in
                    the conversation&quot;
                  </li>
                  <li>
                    • &quot;Summarize the meeting and send a recap to all participants via
                    email&quot;
                  </li>
                  <li>
                    • &quot;Review tasks due today and create a prioritized agenda for the morning
                    standup&quot;
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-6 border-t border-border flex items-center justify-end gap-3 sticky bottom-0 bg-card">
              <button
                onClick={handleCloseModal}
                className="min-w-[120px] px-4 py-2.5 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTrigger}
                disabled={!newTriggerName.trim() || !newTriggerPrompt.trim()}
                className="min-w-[120px] px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTrigger ? 'Save Changes' : 'Create Trigger'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTrigger && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-border flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Delete Trigger</h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-foreground">
                Are you sure you want to delete{' '}
                <span className="font-semibold">&quot;{deleteConfirmTrigger.name}&quot;</span>?
              </p>
            </div>

            <div className="p-6 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmTrigger(null)}
                className="px-4 py-2.5 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteTrigger(deleteConfirmTrigger.id);
                  setDeleteConfirmTrigger(null);
                }}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Trigger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
