import { StatusBadge } from './status-badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2, Video } from 'lucide-react';
import { useState } from 'react';

interface CalendarViewProps {
  onNavigateToMeeting: (meetingId: string) => void;
}

export function CalendarView({ onNavigateToMeeting }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState('2026-01-28');

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const currentWeek = [
    { date: '2026-01-27', day: 27 },
    { date: '2026-01-28', day: 28 },
    { date: '2026-01-29', day: 29 },
    { date: '2026-01-30', day: 30 },
    { date: '2026-01-31', day: 31 },
    { date: '2026-02-01', day: 1 },
    { date: '2026-02-02', day: 2 },
  ];

  const meetings = [
    {
      id: '1',
      date: '2026-01-28',
      title: 'Sprint Planning',
      time: '10:00 AM - 11:00 AM',
      participants: ['David Lee', 'Emma Wilson', 'Chris Brown', 'Lisa Park'],
      status: 'completed' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'processed',
      tasksGenerated: 12,
    },
    {
      id: '2',
      title: 'Product Roadmap Review',
      date: '2026-01-28',
      time: '2:30 PM - 3:15 PM',
      participants: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
      status: 'listening' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'listening',
      tasksGenerated: 0,
    },
    {
      id: '3',
      title: 'Client Demo Call',
      date: '2026-01-28',
      time: '4:00 PM - 4:30 PM',
      participants: ['Jennifer Smith', 'Tom Anderson'],
      status: 'scheduled' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'will-listen',
      tasksGenerated: 0,
    },
    {
      id: '4',
      title: 'Design Review',
      date: '2026-01-29',
      time: '11:00 AM - 12:00 PM',
      participants: ['Jessica Liu', 'Alex Rivera', 'Mike Johnson'],
      status: 'scheduled' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'will-listen',
      tasksGenerated: 0,
    },
    {
      id: '5',
      title: 'Weekly Team Sync',
      date: '2026-01-27',
      time: '9:00 AM - 9:45 AM',
      participants: ['Sarah Chen', 'David Lee', 'Emma Wilson', 'Mike Johnson', 'Alex Rivera'],
      status: 'completed' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'processed',
      tasksGenerated: 8,
    },
    {
      id: '6',
      title: '1-on-1: Sarah & Mike',
      date: '2026-01-29',
      time: '2:00 PM - 2:30 PM',
      participants: ['Sarah Chen', 'Mike Johnson'],
      status: 'scheduled' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'will-listen',
      tasksGenerated: 0,
    },
    {
      id: '7',
      title: 'Engineering Standup',
      date: '2026-01-30',
      time: '9:30 AM - 10:00 AM',
      participants: ['Alex Rivera', 'Chris Brown', 'Lisa Park', 'David Lee'],
      status: 'scheduled' as const,
      calendarSource: 'Google Calendar',
      clerklyStatus: 'will-listen',
      tasksGenerated: 0,
    },
  ];

  const todayMeetings = meetings.filter(m => m.date === selectedDate);

  const getClerklyStatusBadge = (status: string, tasksGenerated: number) => {
    if (status === 'processed') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200">
          <CheckCircle2 className="w-3 h-3" />
          <span>{tasksGenerated} tasks created</span>
        </div>
      );
    } else if (status === 'listening') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
          <Video className="w-3 h-3" />
          <span>Listening now</span>
        </div>
      );
    } else if (status === 'will-listen') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded-full border border-gray-200">
          <Video className="w-3 h-3" />
          <span>Will listen</span>
        </div>
      );
    }
    return null;
  };

  // Calculate total meetings and duration for selected day
  const calculateDayStats = (date: string) => {
    const dayMeetings = meetings.filter(m => m.date === date);
    const totalMeetings = dayMeetings.length;
    
    // Calculate total duration (simplified - assuming durations are consistent)
    let totalMinutes = 0;
    dayMeetings.forEach(m => {
      const [start, end] = m.time.split(' - ');
      // Simple estimation: assuming 1 hour meetings on average
      totalMinutes += 60;
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return {
      count: totalMeetings,
      duration: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    };
  };

  const selectedDayStats = calculateDayStats(selectedDate);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Calendar</h1>
          <p className="text-muted-foreground">
            Your schedule synced from Google Calendar
          </p>
        </div>

        {/* Week Navigator */}
        <div className="bg-card rounded-xl border border-border shadow-sm mb-6">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <h2 className="font-semibold text-foreground">
              January 27 - February 2, 2026
            </h2>
            <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 divide-x divide-border">
            {currentWeek.map((day, idx) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === '2026-01-28';
              const dayMeetings = meetings.filter(m => m.date === day.date);
              
              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`p-4 text-center hover:bg-secondary/50 transition-colors ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="text-xs text-muted-foreground mb-2">
                    {weekDays[idx]}
                  </div>
                  <div
                    className={`text-xl font-semibold mb-2 ${
                      isToday ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {day.day}
                  </div>
                  {dayMeetings.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {dayMeetings.map((meeting) => (
                        <div
                          key={meeting.id}
                          className={`h-1.5 rounded-full ${
                            meeting.clerklyStatus === 'processed'
                              ? 'bg-green-500'
                              : meeting.clerklyStatus === 'listening'
                              ? 'bg-blue-500'
                              : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-4 mb-6">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-300" />
              <span className="text-foreground">Will listen</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-foreground">Listening</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-foreground">Processed</span>
            </div>
          </div>
        </div>

        {/* Meeting List for Selected Day */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">
              {selectedDate === '2026-01-28'
                ? 'Today'
                : new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedDayStats.count} meeting{selectedDayStats.count !== 1 ? 's' : ''} · {selectedDayStats.duration} total
            </p>
          </div>
          
          <div className="divide-y divide-border">
            {todayMeetings.map((meeting) => (
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
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarIcon className="w-4 h-4" />
                      {meeting.time}
                    </div>
                  </div>
                  {getClerklyStatusBadge(meeting.clerklyStatus, meeting.tasksGenerated)}
                </div>
                
                <div className="flex items-center gap-2">
                  {meeting.participants.slice(0, 4).map((participant, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                    >
                      {participant.split(' ').map(n => n[0]).join('')}
                    </div>
                  ))}
                  {meeting.participants.length > 4 && (
                    <span className="text-xs text-muted-foreground">
                      +{meeting.participants.length - 4} more
                    </span>
                  )}
                </div>
              </button>
            ))}
            
            {todayMeetings.length === 0 && (
              <div className="p-12 text-center">
                <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground">No meetings scheduled for this day</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}