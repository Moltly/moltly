"use client";

import { Plus, LogOut, LogIn, Info } from "lucide-react";
import Button from "@/components/ui/Button";
import { DataMode } from "@/types/molt";

interface HeaderProps {
  mode: DataMode;
  onNewEntry: () => void;
  onSignOut?: () => void;
  onOpenInfo?: () => void;
}

export default function Header({ mode, onNewEntry, onSignOut, onOpenInfo }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[rgb(var(--surface))]/95 backdrop-blur-lg border-b border-[rgb(var(--border))] safe-top">
      <div className="flex items-center justify-between px-4 py-3 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary-strong))] flex items-center justify-center text-white font-bold text-sm">
              M
            </div>
            <h1 className="text-xl font-bold text-[rgb(var(--text))]">
              Moltly
            </h1>
          </div>
          {mode === "local" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[rgb(var(--warning-soft))] text-[rgb(var(--warning))] font-medium">
              Guest
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenInfo}
            title="App info and links"
            aria-label="App info and links"
          >
            <Info className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onNewEntry}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Entry</span>
          </Button>

          {mode === "sync" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              title="Sign out"
              className="ml-1"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = "/login")}
              className="gap-1.5"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
