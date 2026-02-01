// Requirements: E.T.4, E.U.3, E.U.4, E.U.5, E.U.6, E.U.7, E.U.8, E.U.9, E.U.10, sidebar-navigation.1.1, sidebar-navigation.2.1, sidebar-navigation.2.4, sidebar-navigation.2.5
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useCallback, useMemo, memo } from "react";
import { Logo } from "./logo";

// Requirements: sidebar-navigation.1.1, sidebar-navigation.2.1, sidebar-navigation.2.4, sidebar-navigation.2.5, sidebar-navigation.5.2
interface NavigationProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// Requirements: sidebar-navigation.2.4
// Wrap component in React.memo to prevent unnecessary re-renders
export const Navigation = memo(function Navigation({
  currentScreen,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: NavigationProps) {
  // Requirements: sidebar-navigation.2.5, sidebar-navigation.2.4
  // Memoize keyboard navigation handler with useCallback
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, itemId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onNavigate(itemId);
      }
    },
    [onNavigate],
  );

  const navIconClassName = "w-5 h-5 shrink-0";

  // Requirements: sidebar-navigation.2.4, sidebar-navigation.2.5
  // Memoize className computation with useMemo to avoid recalculation on every render
  const navButtonClassName = useMemo(
    () =>
      (isActive: boolean): string => {
        const baseClasses = "w-full flex items-center rounded-lg transition-all mb-1 py-3";
        const stateClasses = isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-secondary";
        const layoutClasses = collapsed ? "justify-center px-0" : "gap-3 px-4";
        // Requirements: sidebar-navigation.2.5
        // Visible focus indicator with 2px outline and offset
        const focusClasses =
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";
        return `${baseClasses} ${layoutClasses} ${stateClasses} ${focusClasses}`;
      },
    [collapsed],
  );

  // Requirements: sidebar-navigation.2.4
  // Memoize navigation items to prevent recreation on every render
  const navItems = useMemo(
    () => [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "calendar", label: "Calendar", icon: Calendar },
      { id: "tasks", label: "Tasks", icon: CheckSquare },
      { id: "contacts", label: "Contacts", icon: Users },
    ],
    [],
  );

  // Requirements: sidebar-navigation.2.4
  // Memoize settings item to prevent recreation on every render
  const settingsItem = useMemo(() => ({ id: "settings", label: "Settings", icon: Settings }), []);

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className={`fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col transition-all duration-300 ${
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
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            tabIndex={0}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            ) : (
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            )}
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
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              className={navButtonClassName(isActive)}
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              tabIndex={0}
            >
              <Icon className={navIconClassName} aria-hidden="true" />
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
              onKeyDown={(e) => handleKeyDown(e, settingsItem.id)}
              className={navButtonClassName(isActive)}
              aria-label={collapsed ? settingsItem.label : undefined}
              aria-current={isActive ? "page" : undefined}
              tabIndex={0}
            >
              <Icon className={navIconClassName} aria-hidden="true" />
              {!collapsed ? <span>{settingsItem.label}</span> : null}
            </button>
          );
        })()}
      </div>
    </nav>
  );
});
