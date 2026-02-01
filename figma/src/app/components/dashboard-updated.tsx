import { StatusBadge } from './status-badge';
import { Calendar, Users, CheckCircle2, TrendingUp, Clock, PlayCircle, AlertCircle, Play } from 'lucide-react';
import type { AgentTask } from '@/app/types/agent-task';

interface DashboardProps {
  onNavigateToMeeting: (meetingId: string) => void;
  onNavigateToCalendar: () => void;
}

export function DashboardUpdated({ onNavigateToMeeting, onNavigateToCalendar }: DashboardProps) {
  const todaySchedule = [
    {
      id: '1',
      title: 'Product Roadmap Review',
      time: '2:30 PM - 3:15 PM',
      participants: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
      status: 'upcoming' as const,
      calendarSource: 'Google Calendar',
    },
    {
      id: '2',
      title: 'Sprint Planning',
      time: '4:00 PM - 5:00 PM',
      participants: ['David Lee', 'Emma Wilson', 'Chris Brown'],
      status: 'upcoming' as const,
      calendarSource: 'Google Calendar',
    },
    {
      id: '3',
      title: 'Weekly Team Sync',
      time: '10:00 AM - 10:45 AM',
      participants: ['Sarah Chen', 'Mike Johnson'],
      status: 'recorded' as const,
      calendarSource: 'Google Calendar',
      hasRecording: true,
    },
  ];

  const agentTasks: AgentTask[] = [
    {
      id: 'task-1',
      title: 'Analyze Client Demo Call',
      description: 'Processing transcript and extracting action items',
      status: 'working',
      createdAt: new Date('2026-01-28T11:30:00'),
      updatedAt: new Date('2026-01-28T11:35:00'),
      progress: 65,
    },
    {
      id: 'task-2',
      title: 'Create Jira tasks from Sprint Planning',
      description: 'Waiting for user confirmation on task assignments',
      status: 'requesting-info',
      createdAt: new Date('2026-01-28T10:15:00'),
      updatedAt: new Date('2026-01-28T10:20:00'),
    },
    {
      id: 'task-3',
      title: 'Update contact information',
      description: 'Waiting for your input on duplicate contacts',
      status: 'waiting-input',
      createdAt: new Date('2026-01-28T08:00:00'),
      updatedAt: new Date('2026-01-28T08:05:00'),
    },
    {
      id: 'task-4',
      title: 'Import calendar events to timeline',
      description: 'Failed to authenticate with Google Calendar API',
      status: 'error',
      createdAt: new Date('2026-01-28T07:45:00'),
      updatedAt: new Date('2026-01-28T07:50:00'),
      errorMessage: 'Authentication failed. Please reconnect your Google Calendar in Settings.',
    },
    {
      id: 'task-5',
      title: 'Sync calendar events to project timeline',
      description: 'Successfully synced 12 calendar events',
      status: 'completed',
      createdAt: new Date('2026-01-28T09:00:00'),
      updatedAt: new Date('2026-01-28T09:05:00'),
      completedAt: new Date('2026-01-28T09:05:00'),
    },
    {
      id: 'task-6',
      title: 'Generate meeting summary',
      description: 'Completed summary for Weekly Team Sync',
      status: 'completed',
      createdAt: new Date('2026-01-27T09:45:00'),
      updatedAt: new Date('2026-01-27T09:50:00'),
      completedAt: new Date('2026-01-27T09:50:00'),
    },
  ];

  const handleStartRecording = (meetingId: string) => {
    console.log('Starting recording for meeting:', meetingId);
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date('2026-01-28T14:00:00'); // Current time in the demo
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const activeTasksCount = agentTasks.filter(t => 
    t.status === 'working' || t.status === 'waiting-input' || t.status === 'requesting-info'
  ).length;

  const completedTodayCount = agentTasks.filter(t => 
    t.status === 'completed' && 
    t.completedAt && 
    t.completedAt.toDateString() === new Date('2026-01-28').toDateString()
  ).length;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Wednesday, January 28, 2026
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Schedule */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Today's Schedule</h2>
              <button
                onClick={onNavigateToCalendar}
                className="text-sm text-primary hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-border">
              {todaySchedule.map((meeting, index) => (
                <div
                  key={meeting.id}
                  className={`p-6 hover:bg-secondary/30 transition-colors ${
                    index === todaySchedule.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">
                        {meeting.title}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {meeting.time}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-4">
                    {meeting.participants.slice(0, 3).map((participant, idx) => (
                      <div
                        key={idx}
                        className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                      >
                        {participant.split(' ').map(n => n[0]).join('')}
                      </div>
                    ))}
                    {meeting.participants.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{meeting.participants.length - 3} more
                      </span>
                    )}
                  </div>

                  {meeting.status === 'upcoming' ? (
                    <button
                      onClick={() => handleStartRecording(meeting.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>Join & Record</span>
                    </button>
                  ) : meeting.status === 'recorded' && (
                    <button
                      onClick={() => onNavigateToMeeting(meeting.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors border border-border"
                    >
                      <Play className="w-4 h-4" />
                      <span>Open Recording</span>
                    </button>
                  )}
                </div>
              ))}
              
              {todaySchedule.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No upcoming meetings today</p>
                </div>
              )}
            </div>
          </div>

          {/* Agent Tasks */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-foreground">Agent Tasks</h2>
            </div>
            <div className="divide-y divide-border">
              {agentTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-6 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">
                        {task.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    </div>
                    <StatusBadge status={task.status} size="sm" />
                  </div>

                  {/* Error message */}
                  {task.status === 'error' && task.errorMessage && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-3">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-red-700">{task.errorMessage}</p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons for errors */}
                  {task.status === 'error' && (
                    <div className="flex gap-2 mb-3">
                      <button className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
                        Retry
                      </button>
                      <button className="px-3 py-1.5 bg-secondary text-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors">
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Action buttons for tasks requiring input */}
                  {(task.status === 'waiting-input' || task.status === 'requesting-info') && (
                    <div className="flex gap-2 mb-3">
                      <button className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors">
                        {task.status === 'waiting-input' ? 'Start' : 'Respond'}
                      </button>
                      <button className="px-3 py-1.5 bg-secondary text-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors">
                        Dismiss
                      </button>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>{getTimeAgo(task.updatedAt)}</span>
                    </div>
                    {task.completedAt && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        <span>Completed {getTimeAgo(task.completedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}