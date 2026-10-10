import React from 'react';
import { LayoutDashboard, Repeat, Users, CalendarDays, History } from 'lucide-react';

export type NavTab = 'dashboard' | 'intentions' | 'recipients' | 'calendar' | 'history';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  dueCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, dueCount }) => {
  const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'intentions', label: 'Intentions', icon: Repeat, badge: dueCount > 0 ? dueCount : undefined },
    { id: 'recipients', label: 'Recipients', icon: Users },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-signa-surface/90 backdrop-blur-md border-t border-signa-subtle px-2 sm:px-4 py-1.5 transition-colors">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-0.5 sm:gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'text-signa-primary font-semibold'
                  : 'text-signa-muted hover:text-signa-primary'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-signa-muted'}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-amber-500 text-white dark:text-zinc-950 text-[9px] font-bold font-mono flex items-center justify-center shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate max-w-full ${isActive ? 'text-signa-primary font-semibold' : 'text-signa-muted'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

};
