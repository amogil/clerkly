import { StatusBadge } from "./status-badge";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  Calendar,
  Clock,
  Users,
  ExternalLink,
  MapPin,
  Video,
} from "lucide-react";
import { useState } from "react";

interface MeetingDetailProps {
  meetingId: string;
  onBack: () => void;
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const meeting = {
    title: "Product Roadmap Review",
    date: "January 28, 2026",
    time: "2:30 PM - 3:15 PM",
    duration: "45 min",
    status: "completed" as const,
    location: "Google Meet",
    meetingLink: "meet.google.com/abc-defg-hij",
    organizer: "Sarah Chen",
    calendarSource: "Google Calendar",
    participants: ["Sarah Chen", "Mike Johnson", "Alex Rivera", "Jessica Liu"],
    transcript: [
      {
        speaker: "Sarah Chen",
        time: "00:00",
        text: "Thanks everyone for joining. Let's dive into Q2 roadmap priorities. We need to make some decisions today about the AI features and mobile app redesign.",
      },
      {
        speaker: "Mike Johnson",
        time: "00:42",
        text: "I've reviewed the customer feedback and the AI integration is our top request. We should prioritize it for early Q2.",
      },
      {
        speaker: "Alex Rivera",
        time: "01:15",
        text: "Agreed. I can have the technical architecture doc ready by next Monday. We'll need about 6 weeks for the initial implementation.",
      },
      {
        speaker: "Sarah Chen",
        time: "02:03",
        text: "Perfect. Alex, can you also coordinate with the design team? We need mockups by mid-February.",
      },
      {
        speaker: "Jessica Liu",
        time: "02:38",
        text: "I'll work on the mobile redesign in parallel. We should aim to launch both features together for maximum impact.",
      },
    ],
    actionItems: [
      {
        id: "1",
        assignee: "Alex Rivera",
        task: "Prepare technical architecture document for AI integration",
        dueDate: "February 3, 2026",
        derivedFrom: "Meeting context + calendar",
        priority: "high" as const,
        source: "01:15",
        syncedToJira: true,
        jiraId: "PROJ-1234",
      },
      {
        id: "2",
        assignee: "Alex Rivera",
        task: "Coordinate with design team for AI feature mockups",
        dueDate: "February 14, 2026",
        derivedFrom: "Mentioned deadline",
        priority: "high" as const,
        source: "02:03",
        syncedToJira: true,
        jiraId: "PROJ-1235",
      },
      {
        id: "3",
        assignee: "Jessica Liu",
        task: "Create project plan for mobile app redesign",
        dueDate: "February 10, 2026",
        derivedFrom: "Calendar + context",
        priority: "medium" as const,
        source: "02:38",
        syncedToJira: true,
        jiraId: "PROJ-1236",
      },
      {
        id: "4",
        assignee: "Sarah Chen",
        task: "Review Q2 budget allocation for new features",
        dueDate: "February 5, 2026",
        derivedFrom: "Next team meeting",
        priority: "high" as const,
        source: "00:00",
        syncedToJira: true,
        jiraId: "PROJ-1237",
      },
      {
        id: "5",
        assignee: "Mike Johnson",
        task: "Compile customer feedback report for AI features",
        dueDate: "January 31, 2026",
        derivedFrom: "End of week",
        priority: "medium" as const,
        source: "00:42",
        syncedToJira: false,
      },
    ],
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-50 border-red-200";
      case "medium":
        return "text-amber-600 bg-amber-50 border-amber-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Calendar
        </button>

        <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl font-semibold text-foreground">{meeting.title}</h1>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {meeting.calendarSource}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {meeting.date}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {meeting.time}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {meeting.location}
                </div>
              </div>
            </div>
            <StatusBadge status={meeting.status} />
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {meeting.participants.length} participants
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {meeting.participants.map((participant, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {participant
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <span className="text-sm text-foreground">{participant}</span>
                  {participant === meeting.organizer && (
                    <span className="text-xs text-muted-foreground">(Organizer)</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-secondary/50 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div className="flex-1">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-primary rounded-full" />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>15:30</span>
                  <span>45:00</span>
                </div>
              </div>
              <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <Volume2 className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <h2 className="font-semibold text-foreground">Transcript</h2>
            </div>
            <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              {meeting.transcript.map((entry, idx) => (
                <div key={idx} className="group">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-sm font-medium text-foreground">{entry.speaker}</span>
                    <span className="text-xs text-muted-foreground">{entry.time}</span>
                  </div>
                  <p className="text-foreground/90 leading-relaxed">{entry.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border">
              <h2 className="font-semibold text-foreground">
                Action Items ({meeting.actionItems.length})
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Extracted by Clerkly AI</p>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {meeting.actionItems.map((item) => (
                <div key={item.id} className="p-4 hover:bg-secondary/30 transition-colors">
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-foreground leading-snug mb-2">
                      {item.task}
                    </h4>
                  </div>

                  <div className="space-y-2 text-sm mb-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Who:</span>
                      <div className="font-medium text-foreground mt-0.5">{item.assignee}</div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">When:</span>
                      <div className="text-foreground mt-0.5">{item.dueDate}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        ({item.derivedFrom})
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getPriorityColor(
                        item.priority,
                      )}`}
                    >
                      {item.priority}
                    </span>
                    <button className="text-xs text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {item.source}
                    </button>
                  </div>

                  {item.syncedToJira && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5 text-xs text-green-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span>Synced to Jira ({item.jiraId})</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
