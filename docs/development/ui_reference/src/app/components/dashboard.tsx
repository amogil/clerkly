import { StatusBadge } from './status-badge';
import { Calendar, Users, CheckCircle2, TrendingUp } from 'lucide-react';

interface DashboardProps {
  onNavigateToMeeting: (meetingId: string) => void;
}

export function Dashboard({ onNavigateToMeeting }: DashboardProps) {
  const stats = [
    { label: 'Calls Processed', value: '47', icon: Calendar, trend: '+12 this week' },
    { label: 'Action Items', value: '156', icon: CheckCircle2, trend: '89% completed' },
    { label: 'Active Meetings', value: '3', icon: Users, trend: 'Today' },
    { label: 'Time Saved', value: '8.5h', icon: TrendingUp, trend: 'This week' },
  ];

  const recentMeetings = [
    {
      id: '1',
      title: 'Product Roadmap Review',
      date: 'Today, 2:30 PM',
      duration: '45 min',
      status: 'processing' as const,
      actionItems: 7,
      participants: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
    },
    {
      id: '2',
      title: 'Sprint Planning',
      date: 'Today, 10:00 AM',
      duration: '60 min',
      status: 'completed' as const,
      actionItems: 12,
      participants: ['David Lee', 'Emma Wilson', 'Chris Brown', 'Lisa Park'],
    },
    {
      id: '3',
      title: 'Client Demo Call',
      date: 'Yesterday, 3:15 PM',
      duration: '30 min',
      status: 'completed' as const,
      actionItems: 5,
      participants: ['Jennifer Smith', 'Tom Anderson'],
    },
    {
      id: '4',
      title: 'Weekly Team Sync',
      date: 'Jan 27, 9:00 AM',
      duration: '45 min',
      status: 'completed' as const,
      actionItems: 8,
      participants: ['Sarah Chen', 'David Lee', 'Emma Wilson', 'Mike Johnson', 'Alex Rivera'],
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Your AI clerk is quietly keeping track of everything
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-card rounded-xl border border-border p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <h3 className="text-3xl font-semibold text-foreground mb-1">
                  {stat.value}
                </h3>
                <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
                <p className="text-xs text-primary">{stat.trend}</p>
              </div>
            );
          })}
        </div>

        {/* Recent Meetings */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">Recent Meetings</h2>
          </div>
          <div className="divide-y divide-border">
            {recentMeetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => onNavigateToMeeting(meeting.id)}
                className="w-full p-6 hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      {meeting.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {meeting.date} · {meeting.duration}
                    </p>
                  </div>
                  <StatusBadge status={meeting.status} size="sm" />
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {meeting.actionItems} action items
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {meeting.participants.length} participants
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-3">
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
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
