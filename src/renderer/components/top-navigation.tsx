import { LayoutDashboard, Calendar, CheckSquare, Users, Settings } from 'lucide-react';
import { Logo } from './logo';

interface TopNavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
}

export function TopNavigation({ currentScreen, onNavigate }: TopNavigationProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed top-0 left-0 right-[33.333333%] h-16 bg-card border-b border-border flex items-center px-6 z-50">
      {/* Logo and Brand */}
      <div className="flex items-center gap-3 mr-8">
        <Logo showText={false} />
        <span className="text-xl font-semibold text-foreground">Clerkly</span>
      </div>

      {/* Navigation Items */}
      <div className="flex items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
