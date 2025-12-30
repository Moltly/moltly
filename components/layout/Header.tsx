"use client";

import { Plus, LogOut, LogIn, Info, Moon, Sun, Shield } from "lucide-react";
import LogoMark from "./LogoMark";
import Button from "@/components/ui/Button";
import { DataMode } from "@/types/molt";
import { useTheme } from "@/lib/theme";
import { useEffect, useState } from "react";

interface HeaderProps {
  mode: DataMode;
  onNewEntry?: () => void;
  onSignOut?: () => void;
  onOpenInfo?: () => void;
}

export default function Header({ mode, onNewEntry, onSignOut, onOpenInfo }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAdmin() {
      if (mode !== "sync") return;
      try {
        const res = await fetch("/api/account/admin", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      } catch { }
    }
    loadAdmin();
    return () => { cancelled = true; };
  }, [mode]);
  return (
    <header className="sticky top-0 z-40 w-full bg-[rgb(var(--surface))]/95 backdrop-blur-lg border-b border-[rgb(var(--border))] safe-top">
      <div className="flex items-center justify-between px-4 py-3 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <LogoMark size={32} priority />
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
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (window.location.href = "/admin")}
              className="gap-1.5"
              title="Admin Dashboard"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
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
            disabled={!onNewEntry}
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
