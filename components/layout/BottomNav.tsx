"use client";

import { Home, History, Users, Bell, BookOpen, HeartPulse, Egg, BarChart3 } from "lucide-react";
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
    key: "health" as ViewKey,
    label: "Health",
    icon: HeartPulse,
  },
  {
    key: "breeding" as ViewKey,
    label: "Breeding",
    icon: Egg,
  },
  {
    key: "analytics" as ViewKey,
    label: "Analytics",
    icon: BarChart3,
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
      <div className="max-w-screen-lg mx-auto px-2">
        <div className="flex items-center gap-2 py-2 overflow-x-auto overflow-y-hidden md:overflow-visible md:justify-center scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;

            return (
              <button
                key={item.key}
                onClick={() => onViewChange(item.key)}
                className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-[var(--radius)] transition-all min-w-[70px] flex-shrink-0 snap-center",
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
      </div>
    </nav>
  );
}
