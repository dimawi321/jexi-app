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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800/80 px-2 py-1.5 sm:py-2">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
