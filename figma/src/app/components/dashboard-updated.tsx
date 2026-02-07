import { Clock, PlayCircle, Play } from 'lucide-react';
import { useTasks } from '@/app/contexts/tasks-context';

interface DashboardProps {
  onNavigateToMeeting: (meetingId: string) => void;
  onNavigateToCalendar: () => void;
  onNavigateToTasks?: () => void;
}

export function DashboardUpdated({ onNavigateToMeeting, onNavigateToCalendar, onNavigateToTasks }: DashboardProps) {
  const { tasks, taskLists, updateTask } = useTasks();

  const todaySchedule = [
    {
      id: '1',
      title: 'Product Roadmap Review',
      description: 'Review Q2 roadmap priorities and discuss feature timelines with product team',
      time: '2:30 PM - 3:15 PM',
      participants: ['Sarah Chen', 'Mike Johnson', 'Alex Rivera'],
      status: 'upcoming' as const,
      calendarSource: 'Google Calendar',
    },
    {
      id: '2',
      title: 'Sprint Planning',
      description: 'Plan upcoming sprint tasks and estimate story points with engineering team',
      time: '4:00 PM - 5:00 PM',
      participants: ['David Lee', 'Emma Wilson', 'Chris Brown'],
      status: 'upcoming' as const,
      calendarSource: 'Google Calendar',
    },
    {
      id: '3',
      title: 'Weekly Team Sync',
      description: 'Weekly check-in on project progress and blockers',
      time: '10:00 AM - 10:45 AM',
      participants: ['Sarah Chen', 'Mike Johnson'],
      status: 'recorded' as const,
      calendarSource: 'Google Calendar',
      hasRecording: true,
    },
  ];

  // Tasks for today (filter by due date = today: 2026-02-05)
  const today = '2026-02-05';
  const todayTasks = tasks.filter(task => {
    if (!task.due) return false;
    const taskDate = task.due.split('T')[0];
    return taskDate === today;
  });

  const handleStartRecording = (meetingId: string) => {
    console.log('Starting recording for meeting:', meetingId);
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getTaskStatusColor = (status: 'todo' | 'in-progress' | 'completed') => {
    switch (status) {
      case 'todo':
        return 'text-muted-foreground';
      case 'in-progress':
        return 'text-blue-600';
      case 'completed':
        return 'text-green-600';
    }
  };

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
                  className={`p-6 hover:bg-secondary/30 transition-colors ${index === todaySchedule.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <h3 className="font-semibold text-foreground mb-1">
                    {meeting.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {meeting.description}
                  </p>

                  {/* Action button */}
                  {meeting.status === 'upcoming' ? (
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => handleStartRecording(meeting.id)}
                        className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>Join</span>
                      </button>
                      <div className="flex-1"></div>
                    </div>
                  ) : meeting.status === 'recorded' && (
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => onNavigateToMeeting(meeting.id)}
                        className="flex-1 px-4 py-2.5 bg-secondary text-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors border border-border flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        <span>Open Recording</span>
                      </button>
                      <div className="flex-1"></div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {meeting.time}
                    </div>
                    <div className="flex items-center gap-2">
                      {meeting.participants.slice(0, 3).map((participant, idx) => (
                        <div
                          key={idx}
                          className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                        >
                          {participant.split(' ').map(n => n[0]).join('')}
                        </div>
                      ))}
                      {meeting.participants.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{meeting.participants.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {todaySchedule.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No upcoming meetings today</p>
                </div>
              )}
            </div>
          </div>

          {/* Tasks for Today */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Tasks for Today</h2>
              <button
                onClick={onNavigateToTasks}
                className="text-sm text-primary hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-border">
              {todayTasks.map((task) => {
                const taskListTitle = taskLists.find(list => list.id === task.taskListId)?.title || 'Unknown List';
                return (
                  <div
                    key={task.id}
                    className="p-6 hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => console.log('Open task:', task.id)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={task.status === 'completed'}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTask(task.id, { 
                            status: task.status === 'completed' ? 'needsAction' : 'completed' 
                          });
                        }}
                        className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <h3 className={`font-semibold mb-1 ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {task.title}
                        </h3>
                        {task.notes && (
                          <p className="text-sm text-muted-foreground mb-2">{task.notes}</p>
                        )}
                        
                        <div className="flex items-center gap-3">
                          {/* Task List badge */}
                          <span className="text-xs px-2 py-1 rounded border bg-blue-50 text-blue-700 border-blue-200">
                            {taskListTitle}
                          </span>
                          
                          {/* Status */}
                          <span className={`text-xs ${task.status === 'completed' ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {task.status === 'needsAction' ? 'Pending' : 'Completed'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {todayTasks.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No tasks due today</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}