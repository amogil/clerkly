import { StatusBadge } from './status-badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Users, PlayCircle } from 'lucide-react';
import { useState } from 'react';

interface CalendarViewProps {
  onNavigateToMeeting: (meetingId: string) => void;
}

export function CalendarView({ onNavigateToMeeting }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState('2026-01-28');
  const [currentMonth, setCurrentMonth] = useState({ month: 0, year: 2026 }); // January 2026

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const meetings = [
    {
      id: '1',
      date: '2026-01-28',
      title: 'Sprint Planning',
      time: '10:00 AM - 11:00 AM',
      duration: '60 min',
      participants: ['David Lee', 'Emma Wilson', 'Chris Brown', 'Lisa Park'],
      status: 'completed' as const,
    },
    {
      id: '2',
      title: 'Product Roadmap Review',
      date: '2026-01-28',
      time: '2:30 PM - 3:15 PM',
      duration: '45 min',
      participants: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
      status: 'upcoming' as const,
    },
    {
      id: '3',
      title: 'Client Demo Call',
      date: '2026-01-28',
      time: '4:00 PM - 4:30 PM',
      duration: '30 min',
      participants: ['Jennifer Smith', 'Tom Anderson'],
      status: 'upcoming' as const,
    },
    {
      id: '4',
      title: 'Design Review',
      date: '2026-01-29',
      time: '11:00 AM - 12:00 PM',
      duration: '60 min',
      participants: ['Jessica Liu', 'Alex Rivera', 'Mike Johnson'],
      status: 'upcoming' as const,
    },
    {
      id: '5',
      title: 'Weekly Team Sync',
      date: '2026-01-27',
      time: '9:00 AM - 9:45 AM',
      duration: '45 min',
      participants: ['Sarah Chen', 'David Lee', 'Emma Wilson', 'Mike Johnson', 'Alex Rivera'],
      status: 'completed' as const,
    },
    {
      id: '6',
      title: 'Engineering Review',
      date: '2026-01-27',
      time: '2:00 PM - 3:00 PM',
      duration: '60 min',
      participants: ['Alex Rivera', 'Chris Brown', 'Lisa Park'],
      status: 'completed' as const,
    },
    {
      id: '7',
      title: '1:1 with Sarah',
      date: '2026-01-30',
      time: '2:00 PM - 2:30 PM',
      duration: '30 min',
      participants: ['Sarah Chen'],
      status: 'upcoming' as const,
    },
  ];

  // Generate calendar days for current month
  const getDaysInMonth = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    
    // Add empty cells for days before the first day of month
    const startDay = firstDay === 0 ? 6 : firstDay - 1; // Make Monday first day
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const days = getDaysInMonth(currentMonth.month, currentMonth.year);

  const getMeetingsForDate = (day: number | null) => {
    if (!day) return [];
    const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return meetings.filter(m => m.date === dateStr);
  };

  const selectedDateMeetings = meetings.filter(m => m.date === selectedDate);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 0) {
        return { month: 11, year: prev.year - 1 };
      }
      return { month: prev.month - 1, year: prev.year };
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 11) {
        return { month: 0, year: prev.year + 1 };
      }
      return { month: prev.month + 1, year: prev.year };
    });
  };

  const handleDayClick = (day: number | null) => {
    if (!day) return;
    const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  const stats = {
    totalThisMonth: meetings.filter(m => m.date.startsWith('2026-01')).length,
    completedThisMonth: meetings.filter(m => m.date.startsWith('2026-01') && m.status === 'completed').length,
    totalDuration: meetings.reduce((acc, m) => acc + parseInt(m.duration), 0),
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Calendar</h1>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="col-span-2 bg-card rounded-xl border border-border shadow-sm p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {monthNames[currentMonth.month]} {currentMonth.year}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {/* Weekday Headers */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="text-center py-2">
                  <span className="text-sm font-medium text-muted-foreground">{day}</span>
                </div>
              ))}

              {/* Calendar Days */}
              {days.map((day, index) => {
                const dateStr = day
                  ? `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  : '';
                const dayMeetings = getMeetingsForDate(day);
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === '2026-01-28';

                return (
                  <button
                    key={index}
                    onClick={() => handleDayClick(day)}
                    disabled={!day}
                    className={`aspect-square p-2 rounded-lg border transition-all relative ${
                      !day
                        ? 'border-transparent'
                        : isSelected
                        ? 'border-primary bg-primary/10'
                        : isToday
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:border-primary/30 hover:bg-secondary'
                    }`}
                  >
                    {day && (
                      <>
                        <div className="text-sm font-medium text-foreground">{day}</div>
                        {dayMeetings.length > 0 && (
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {dayMeetings.slice(0, 3).map((_, idx) => (
                              <div key={idx} className="w-1 h-1 rounded-full bg-primary" />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Meetings */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {selectedDate === '2026-01-28' ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </h3>

            {selectedDateMeetings.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No meetings scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                    onClick={() => onNavigateToMeeting(meeting.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground text-sm">{meeting.title}</h4>
                      <StatusBadge status={meeting.status} size="sm" />
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Clock className="w-3 h-3" />
                      <span>{meeting.time}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {meeting.participants.length} participant{meeting.participants.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {meeting.status === 'upcoming' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Start recording:', meeting.id);
                        }}
                        className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-xs"
                      >
                        <PlayCircle className="w-3 h-3" />
                        <span>Join & Record</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}