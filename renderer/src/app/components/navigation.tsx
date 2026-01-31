// Requirements: E.T.4, E.U.3, E.U.4, E.U.5, E.U.6, E.U.7, E.U.8
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Logo } from "./logo";

interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Navigation({
  currentScreen,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: NavigationProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "contacts", label: "Contacts", icon: Users },
  ];
  const settingsItem = { id: "settings", label: "Settings", icon: Settings };

  return (
    <nav
      className={`fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className={`border-b border-border ${collapsed ? "pl-2 pr-1 py-3" : "p-6"}`}>
        <div className={`flex items-center justify-between ${collapsed ? "gap-1" : "gap-2"}`}>
          <div className={`flex-1 min-w-0 ${collapsed ? "ml-1" : ""}`}>
            <Logo size="md" showText={!collapsed} />
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 p-1"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        {!collapsed ? <p className="text-sm text-muted-foreground mt-1">Stay on track</p> : null}
      </div>

      <div className="flex-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mb-1 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-5 h-5" />
              {!collapsed ? <span>{item.label}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="p-4 border-t border-border">
        {(() => {
          const Icon = settingsItem.icon;
          const isActive = currentScreen === settingsItem.id;
          return (
            <button
              onClick={() => onNavigate(settingsItem.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-5 h-5" />
              {!collapsed ? <span>{settingsItem.label}</span> : null}
            </button>
          );
        })()}
      </div>
    </nav>
  );
}
