"use client";

import { Home, History, Users, Bell, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewKey } from "@/types/molt";

interface BottomNavProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const navItems = [
  {
    key: "overview" as ViewKey,
    label: "Overview",
    icon: Home,
  },
  {
    key: "activity" as ViewKey,
    label: "Activity",
    icon: History,
  },
  {
    key: "specimens" as ViewKey,
    label: "Specimens",
    icon: Users,
  },
  {
    key: "reminders" as ViewKey,
    label: "Reminders",
    icon: Bell,
  },
  {
    key: "notebook" as ViewKey,
    label: "Notebook",
    icon: BookOpen,
  },
];

export default function BottomNav({ activeView, onViewChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[rgb(var(--surface))]/95 backdrop-blur-lg border-t border-[rgb(var(--border))] safe-bottom">
      <div className="flex items-center justify-around max-w-screen-lg mx-auto px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;

          return (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-[var(--radius)] transition-all min-w-[60px]",
                isActive
                  ? "text-[rgb(var(--primary))]"
                  : "text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
              )}
            >
              <Icon
                className={cn(
                  "transition-all",
                  isActive ? "w-6 h-6" : "w-5 h-5"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={cn(
                  "text-xs font-medium transition-all",
                  isActive ? "scale-100 opacity-100" : "scale-95 opacity-70"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
