import { StatusBadge } from "./status-badge";
import { Calendar, Users, CheckCircle2, TrendingUp, Clock, PlayCircle } from "lucide-react";

interface DashboardProps {
  onNavigateToMeeting: (meetingId: string) => void;
  onNavigateToCalendar: () => void;
}

export function DashboardUpdated({ onNavigateToMeeting, onNavigateToCalendar }: DashboardProps) {
  const todaySchedule = [
    {
      id: "1",
      title: "Product Roadmap Review",
      time: "2:30 PM - 3:15 PM",
      participants: ["Sarah Chen", "Mike Johnson", "Alex Rivera"],
      status: "upcoming" as const,
      calendarSource: "Google Calendar",
    },
    {
      id: "2",
      title: "Sprint Planning",
      time: "4:00 PM - 5:00 PM",
      participants: ["David Lee", "Emma Wilson", "Chris Brown"],
      status: "upcoming" as const,
      calendarSource: "Google Calendar",
    },
  ];

  const recentProcessed = [
    {
      id: "3",
      title: "Client Demo Call",
      date: "Today, 11:00 AM",
      duration: "30 min",
      status: "completed" as const,
      actionItems: 5,
      tasksCreated: 3,
      participants: ["Jennifer Smith", "Tom Anderson"],
    },
    {
      id: "4",
      title: "Weekly Team Sync",
      date: "Yesterday, 9:00 AM",
      duration: "45 min",
      status: "completed" as const,
      actionItems: 8,
      tasksCreated: 6,
      participants: ["Sarah Chen", "David Lee", "Emma Wilson", "Mike Johnson"],
    },
    {
      id: "5",
      title: "Engineering Review",
      date: "Jan 27, 2:00 PM",
      duration: "60 min",
      status: "completed" as const,
      actionItems: 12,
      tasksCreated: 10,
      participants: ["Alex Rivera", "Chris Brown", "Lisa Park"],
    },
  ];

  const handleStartRecording = (meetingId: string) => {
    console.log("Starting recording for meeting:", meetingId);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Today is Wednesday, January 28, 2026</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Today's Schedule</h2>
                <p className="text-sm text-muted-foreground mt-0.5">From Google Calendar</p>
              </div>
              <button
                onClick={onNavigateToCalendar}
                className="text-sm text-primary hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-border">
              {todaySchedule.map((meeting) => (
                <div key={meeting.id} className="p-6 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">{meeting.title}</h3>
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
                        {participant
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                    ))}
                    {meeting.participants.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{meeting.participants.length - 3} more
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleStartRecording(meeting.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Start Recording</span>
                  </button>
                </div>
              ))}

              {todaySchedule.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No upcoming meetings today</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-foreground">Recently Processed</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Meetings transcribed by Clerkly
              </p>
            </div>
            <div className="divide-y divide-border">
              {recentProcessed.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onNavigateToMeeting(meeting.id)}
                  className="w-full p-6 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">{meeting.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {meeting.date} · {meeting.duration}
                      </p>
                    </div>
                    <StatusBadge status={meeting.status} size="sm" />
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-muted-foreground">
                        {meeting.actionItems} action items
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-muted-foreground">
                        {meeting.tasksCreated} tasks created
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground mb-1">Calendar Sync Active</h3>
              <p className="text-sm text-muted-foreground">
                Clerkly is monitoring your Google Calendar
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-foreground">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
