import { CheckCircle2, Circle, Calendar, User, ExternalLink, Filter, Clock } from 'lucide-react';
import { useState } from 'react';

export function TasksView() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const tasks = [
    {
      id: '1',
      title: 'Prepare technical architecture document for AI integration',
      assignee: 'Alex Rivera',
      dueDate: 'February 3, 2026',
      derivedFrom: 'Meeting context + calendar',
      status: 'pending' as const,
      priority: 'high' as const,
      source: 'Product Roadmap Review',
      sourceDate: 'Today, 2:30 PM',
      synced: true,
      jiraId: 'PROJ-1234',
    },
    {
      id: '2',
      title: 'Coordinate with design team for AI feature mockups',
      assignee: 'Alex Rivera',
      dueDate: 'February 14, 2026',
      derivedFrom: 'Mentioned deadline',
      status: 'pending' as const,
      priority: 'high' as const,
      source: 'Product Roadmap Review',
      sourceDate: 'Today, 2:30 PM',
      synced: true,
      jiraId: 'PROJ-1235',
    },
    {
      id: '3',
      title: 'Review Q2 budget allocation for new features',
      assignee: 'Sarah Chen',
      dueDate: 'February 5, 2026',
      derivedFrom: 'Next team meeting',
      status: 'pending' as const,
      priority: 'high' as const,
      source: 'Product Roadmap Review',
      sourceDate: 'Today, 2:30 PM',
      synced: true,
      jiraId: 'PROJ-1236',
    },
    {
      id: '4',
      title: 'Update sprint board with new user stories',
      assignee: 'David Lee',
      dueDate: 'January 29, 2026',
      derivedFrom: 'End of week',
      status: 'completed' as const,
      priority: 'medium' as const,
      source: 'Sprint Planning',
      sourceDate: 'Today, 10:00 AM',
      synced: true,
      jiraId: 'PROJ-1220',
    },
    {
      id: '5',
      title: 'Send follow-up email with demo recording',
      assignee: 'Jennifer Smith',
      dueDate: 'January 29, 2026',
      derivedFrom: 'Same day follow-up',
      status: 'completed' as const,
      priority: 'medium' as const,
      source: 'Client Demo Call',
      sourceDate: 'Yesterday, 3:15 PM',
      synced: false,
    },
    {
      id: '6',
      title: 'Schedule design review session with stakeholders',
      assignee: 'Emma Wilson',
      dueDate: 'February 1, 2026',
      derivedFrom: 'Calendar availability',
      status: 'pending' as const,
      priority: 'medium' as const,
      source: 'Sprint Planning',
      sourceDate: 'Today, 10:00 AM',
      synced: true,
      jiraId: 'PROJ-1225',
    },
    {
      id: '7',
      title: 'Compile customer feedback report for AI features',
      assignee: 'Mike Johnson',
      dueDate: 'January 31, 2026',
      derivedFrom: 'End of week',
      status: 'pending' as const,
      priority: 'medium' as const,
      source: 'Product Roadmap Review',
      sourceDate: 'Today, 2:30 PM',
      synced: true,
      jiraId: 'PROJ-1237',
    },
    {
      id: '8',
      title: 'Create project plan for mobile app redesign',
      assignee: 'Jessica Liu',
      dueDate: 'February 10, 2026',
      derivedFrom: 'Calendar + context',
      status: 'pending' as const,
      priority: 'medium' as const,
      source: 'Product Roadmap Review',
      sourceDate: 'Today, 2:30 PM',
      synced: true,
      jiraId: 'PROJ-1238',
    },
  ];

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Tasks</h1>
          <p className="text-muted-foreground">
            All action items extracted from your meetings
          </p>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl border border-border shadow-sm mb-6 p-4">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Tasks' },
                { value: 'pending', label: 'Pending' },
                { value: 'completed', label: 'Completed' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value as any)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    filter === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="divide-y divide-border">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`p-6 hover:bg-secondary/30 transition-colors ${
                  task.status === 'completed' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-medium text-foreground mb-3 ${
                        task.status === 'completed' ? 'line-through' : ''
                      }`}
                    >
                      {task.title}
                    </h3>
                    
                    <div className="flex flex-wrap gap-4 text-sm mb-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="w-4 h-4" />
                        <span>{task.assignee}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>{task.dueDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{task.derivedFrom}</span>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full border font-medium ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        From: <span className="text-foreground">{task.source}</span> ·{' '}
                        {task.sourceDate}
                      </span>
                      {task.synced && task.jiraId && (
                        <div className="flex items-center gap-1.5 text-green-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-xs font-medium">
                            Synced to Jira ({task.jiraId})
                          </span>
                        </div>
                      )}
                      {!task.synced && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                          Pending sync
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {filteredTasks.length === 0 && (
          <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
            <p className="text-muted-foreground">No tasks found for this filter</p>
          </div>
        )}
      </div>
    </div>
  );
}