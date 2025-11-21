"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Home,
  History,
  Users,
  Bell,
  BookOpen,
  HeartPulse,
  Egg,
  BarChart3,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { GripVertical } from "lucide-react";
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

type NavPrefs = {
  order: ViewKey[];
  hidden: ViewKey[];
};

const NAV_PREFS_KEY = "moltly:nav-prefs";
const OPEN_CUSTOMIZE_EVENT = "moltly:open-customize-tabs";

function defaultHiddenKeys(): ViewKey[] {
  // Hide everything except Overview, Specimens, Activity by default
  const keep = new Set<ViewKey>(["overview", "specimens", "activity"]);
  return navItems.map((n) => n.key).filter((k) => !keep.has(k));
}

function loadPrefs(defaultOrder: ViewKey[]): NavPrefs {
  if (typeof window === "undefined") return { order: defaultOrder, hidden: [] };
  try {
    const raw = window.localStorage.getItem(NAV_PREFS_KEY);
    if (!raw) return { order: defaultOrder, hidden: defaultHiddenKeys() };
    const data = JSON.parse(raw) as Partial<NavPrefs>;
    const order = Array.isArray(data.order) && data.order.length > 0 ? (data.order as ViewKey[]) : defaultOrder;
    const hidden = Array.isArray(data.hidden) ? (data.hidden as ViewKey[]) : defaultHiddenKeys();
    // Sanitize values against current items
    const allowed = new Set(navItems.map((n) => n.key));
    const cleanedOrder = order.filter((k) => allowed.has(k));
    const missing = navItems.map((n) => n.key).filter((k) => !cleanedOrder.includes(k));
    return { order: [...cleanedOrder, ...missing], hidden: hidden.filter((k) => allowed.has(k)) };
  } catch {
    return { order: defaultOrder, hidden: defaultHiddenKeys() };
  }
}

function savePrefs(prefs: NavPrefs) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

export default function BottomNav({ activeView, onViewChange }: BottomNavProps) {
  const defaultKeys = useMemo(() => navItems.map((n) => n.key), []);
  const [prefs, setPrefs] = useState<NavPrefs>(() => loadPrefs(defaultKeys));
  const [menuOpen, setMenuOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draggingKey, setDraggingKey] = useState<ViewKey | null>(null);
  const [overKey, setOverKey] = useState<ViewKey | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const barListRef = useRef<HTMLDivElement | null>(null);
  const modalListRef = useRef<HTMLDivElement | null>(null);
  const sheetListRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setPrefs((prev) => loadPrefs(defaultKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow desktop Header to open the Customize modal via a global event
  useEffect(() => {
    const open = () => setCustomizeOpen(true);
    if (typeof window !== "undefined") {
      window.addEventListener(OPEN_CUSTOMIZE_EVENT as any, open as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(OPEN_CUSTOMIZE_EVENT as any, open as EventListener);
      }
    };
  }, []);

  // (More button now always visible; no viewport tracking needed.)

  // Close the More menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const withinMenu = !!(menuRef.current && target && menuRef.current.contains(target));
      const withinButton = !!(moreBtnRef.current && target && moreBtnRef.current.contains(target));
      if (!withinMenu && !withinButton) {
        setMenuOpen(false);
        setReorderMode(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setReorderMode(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const orderedItems = useMemo(() => {
    const map = new Map(navItems.map((n) => [n.key, n] as const));
    return prefs.order.map((k) => map.get(k)!).filter(Boolean);
  }, [prefs.order]);

  const visibleItems = orderedItems.filter((i) => !prefs.hidden.includes(i.key));
  const hiddenItems = orderedItems.filter((i) => prefs.hidden.includes(i.key));

  const toggleHidden = (key: ViewKey) => {
    setPrefs((prev) => {
      const hidden = new Set(prev.hidden);
      hidden.has(key) ? hidden.delete(key) : hidden.add(key);
      const next = { ...prev, hidden: Array.from(hidden) };
      savePrefs(next);
      return next;
    });
  };

  const move = (key: ViewKey, dir: -1 | 1) => {
    setPrefs((prev) => {
      const idx = prev.order.indexOf(key);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.order.length) return prev;
      const nextOrder = [...prev.order];
      const [item] = nextOrder.splice(idx, 1);
      nextOrder.splice(j, 0, item);
      const next = { ...prev, order: nextOrder };
      savePrefs(next);
      return next;
    });
  };

  const resetPrefs = () => {
    const next = { order: defaultKeys, hidden: defaultHiddenKeys() } as NavPrefs;
    setPrefs(next);
    savePrefs(next);
  };

  const reorder = (fromKey: ViewKey, toKey: ViewKey) => {
    if (fromKey === toKey) return;
    setPrefs((prev) => {
      const order = [...prev.order];
      const from = order.indexOf(fromKey);
      const to = order.indexOf(toKey);
      if (from < 0 || to < 0) return prev;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const next = { ...prev, order };
      savePrefs(next);
      return next;
    });
  };

  return (
    <nav className={cn(
      "fixed bottom-0 left-0 right-0 z-50 bg-[rgb(var(--surface))]/95 backdrop-blur-lg border-t border-[rgb(var(--border))] safe-bottom",
      reorderMode ? "touch-none select-none" : undefined
    )}>
      <div className="max-w-screen-lg mx-auto px-2 relative">
        <div
          ref={barListRef}
          className={cn(
            "flex items-center gap-2 py-2 overflow-x-auto overflow-y-hidden justify-center scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            reorderMode ? "touch-none" : undefined
          )}
          style={reorderMode ? { touchAction: "none" } : undefined}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;

            return (
              <button
                key={item.key}
                onClick={() => { if (!reorderMode) onViewChange(item.key); }}
                draggable={reorderMode}
                aria-grabbed={reorderMode && draggingKey === item.key}
                data-nav-key={item.key}
                onDragStart={(e) => {
                  if (!reorderMode) return;
                  try {
                    e.dataTransfer?.setData("text/plain", item.key);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                  } catch {}
                  setDraggingKey(item.key);
                }}
                onDragOver={(e) => { if (!reorderMode) return; e.preventDefault(); setOverKey(item.key); }}
                onDrop={(e) => { e.preventDefault(); if (reorderMode && draggingKey) reorder(draggingKey, item.key); setDraggingKey(null); setOverKey(null); }}
                onDragEnd={() => { setDraggingKey(null); setOverKey(null); }}
                onPointerDown={(e) => {
                  // Enable touch drag on mobile for reorder mode
                  if (!reorderMode || e.pointerType === "mouse") return;
                  e.preventDefault();
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                  setDraggingKey(item.key);
                  setOverKey(item.key);
                }}
                onPointerMove={(e) => {
                  if (!reorderMode || e.pointerType === "mouse") return;
                  e.preventDefault();
                  if (!draggingKey) return;
                  const container = barListRef.current;
                  if (!container) return;
                  const nodes = Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-nav-key]'));
                  const centers = nodes.map((n) => ({ key: n.getAttribute('data-nav-key') as ViewKey, x: n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2 }));
                  const x = e.clientX;
                  let target = centers[0]?.key;
                  let min = Infinity;
                  for (const c of centers) {
                    const d = Math.abs(c.x - x);
                    if (d < min) { min = d; target = c.key; }
                  }
                  if (target && target !== overKey) setOverKey(target);
                }}
                onPointerUp={(e) => {
                  if (!reorderMode || !draggingKey) return;
                  const target = overKey ?? draggingKey;
                  if (target && draggingKey) reorder(draggingKey, target);
                  setDraggingKey(null);
                  setOverKey(null);
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                }}
                onPointerCancel={(e) => {
                  if (!reorderMode) return;
                  setDraggingKey(null);
                  setOverKey(null);
                  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                }}
                className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-[var(--radius)] transition-all min-w-[70px] flex-shrink-0 snap-center",
                isActive
                  ? "text-[rgb(var(--primary))]"
                  : "text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]",
                reorderMode ? "cursor-grab select-none border border-dashed border-[rgb(var(--border))] touch-none" : undefined,
                reorderMode && overKey === item.key && draggingKey && draggingKey !== item.key ? "ring-2 ring-[rgb(var(--primary-soft))]" : undefined
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

          {/* More / Customize */}
          <button
            ref={moreBtnRef}
            onClick={() => setMenuOpen((s) => !s)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-[var(--radius)] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]",
              visibleItems.length > 3 ? "ml-auto md:ml-0" : undefined
            )}
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-xs">More</span>
          </button>
        </div>
        {/* Bottom sheet for More */}
        {menuOpen && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-end sm:justify-end pointer-events-none sm:pb-6">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto animate-fade-in"
              onClick={() => { setMenuOpen(false); }}
            />
            <div ref={menuRef} className="relative w-full sm:max-w-3xl sm:mx-auto px-3 pb-3 safe-bottom pointer-events-auto">
              <div className="rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[var(--shadow-xl)] overflow-hidden animate-slide-up sm:animate-fade-in max-h-[calc(100vh-32px)] overflow-y-auto overscroll-contain">
                <div className="flex items-start justify-between px-4 pt-3 pb-2 gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[rgb(var(--text-subtle))]">More</p>
                    <p className="text-sm text-[rgb(var(--text-soft))]">Hidden tabs and quick actions</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        "px-3 py-1.5 rounded-[var(--radius-sm)] text-xs border border-[rgb(var(--border))]",
                        reorderMode ? "bg-[rgb(var(--primary))] text-white border-transparent" : "text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                      )}
                      onClick={() => setReorderMode((s) => !s)}
                    >
                      {reorderMode ? "Done reordering" : "Reorder"}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                      onClick={() => { setCustomizeOpen(true); setMenuOpen(false); }}
                    >
                      Customize
                    </button>
                    <button className="p-1 rounded-[var(--radius-sm)] hover:bg-[rgb(var(--bg-muted))]" onClick={() => { setMenuOpen(false); }} aria-label="Close More">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-4 space-y-3">
                  {reorderMode ? (
                    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 touch-none" style={{ touchAction: "none" }} ref={sheetListRef}>
                      <p className="text-xs text-[rgb(var(--text-subtle))]">Drag to reorder. Tap the eye to pin/unpin from the bar.</p>
                      {orderedItems.map((item) => (
                        <div
                          key={item.key}
                          draggable
                          onDragStart={(e) => {
                            try {
                              e.dataTransfer?.setData("text/plain", item.key);
                              if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                            } catch {}
                            setDraggingKey(item.key);
                          }}
                          onDragOver={(e) => { e.preventDefault(); setOverKey(item.key); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingKey) reorder(draggingKey, item.key);
                            setDraggingKey(null);
                            setOverKey(null);
                          }}
                          onDragEnd={() => { setDraggingKey(null); setOverKey(null); }}
                          onPointerDown={(e) => {
                            if (e.pointerType === "mouse") return;
                            e.preventDefault();
                            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                    setDraggingKey(item.key);
                    setOverKey(item.key);
                  }}
                          onPointerMove={(e) => {
                            if (!draggingKey || e.pointerType === "mouse") return;
                            e.preventDefault();
                            const container = sheetListRef.current;
                            if (!container) return;
                            const nodes = Array.from(container.querySelectorAll<HTMLDivElement>('[data-sheet-item]'));
                            const centers = nodes.map((n) => ({ key: n.getAttribute('data-key') as ViewKey, y: n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2 }));
                            const y = e.clientY;
                            let target = centers[0]?.key;
                            let min = Infinity;
                            for (const c of centers) {
                              const d = Math.abs(c.y - y);
                              if (d < min) { min = d; target = c.key; }
                    }
                    if (target && target !== overKey) setOverKey(target);
                  }}
                  onPointerUp={(e) => {
                    if (!draggingKey) return;
                    const target = overKey ?? draggingKey;
                    if (target && draggingKey) reorder(draggingKey, target);
                    setDraggingKey(null);
                    setOverKey(null);
                    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                  }}
                  onPointerCancel={(e) => {
                    setDraggingKey(null);
                    setOverKey(null);
                    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 p-3 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--border))]",
                            overKey === item.key && draggingKey && draggingKey !== item.key ? "ring-2 ring-[rgb(var(--primary-soft))]" : undefined,
                          )}
                          data-sheet-item
                          data-key={item.key}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-[rgb(var(--text-soft))] cursor-grab" />
                            <item.icon className="w-4 h-4" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          <button
                            className="p-1 rounded-[var(--radius-sm)] hover:bg-[rgb(var(--surface))]"
                            onClick={() => toggleHidden(item.key)}
                            aria-label={prefs.hidden.includes(item.key) ? "Pin to bar" : "Move under More"}
                          >
                            {prefs.hidden.includes(item.key) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : hiddenItems.length === 0 ? (
                    <p className="text-xs text-[rgb(var(--text-subtle))]">Everything is already on the bar.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {hiddenItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-2 p-3 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--border))]"
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-[rgb(var(--text-soft))]" />
                              <span className="text-sm font-medium">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                className="px-2 py-1 text-xs rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] border border-[rgb(var(--border))] hover:border-[rgb(var(--text-soft))]"
                                onClick={() => { onViewChange(item.key); setMenuOpen(false); }}
                              >
                                Open
                              </button>
                              <button
                                className="px-2 py-1 text-xs rounded-[var(--radius-sm)] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface))]"
                                onClick={() => toggleHidden(item.key)}
                              >
                                Pin
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap text-xs text-[rgb(var(--text-subtle))]">
                    <span className={cn(reorderMode ? "text-[rgb(var(--text-soft))]" : undefined)}>
                      {reorderMode ? "Drag to reorder. Tap the eye to move tabs under or off the bar." : "Tap Pin to bring a tab back to the bar, or use Reorder to adjust order."}
                    </span>
                    <span className="hidden sm:inline">Customize opens the full editor if you need more control.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customize Modal (rendered in a portal to avoid nav clipping on desktop) */}
      {customizeOpen && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] animate-fade-in" onClick={() => setCustomizeOpen(false)} />
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-2 sm:p-4">
            <div className="w-full sm:w-auto max-w-[620px] sm:max-w-[620px] sm:max-h-[90dvh] sm:rounded-[var(--radius-lg)] rounded-t-[var(--radius)] bg-[rgb(var(--surface))] border border-[rgb(var(--border))] shadow-[var(--shadow-lg)] overflow-hidden animate-slide-up sm:animate-fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))]">
                <h3 className="text-base font-semibold">Customize Tabs</h3>
                <button className="p-1" onClick={() => setCustomizeOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3 touch-none" style={{ touchAction: "none" }} ref={modalListRef}>
                <p className="text-xs text-[rgb(var(--text-subtle))] mb-1">Drag to reorder, hide to move under More.</p>
                {orderedItems.map((item) => (
                  <div
                    key={item.key}
                  draggable
                onDragStart={(e) => {
                  // Ensure HTML5 drag works consistently (e.g., Safari)
                  try {
                    e.dataTransfer?.setData("text/plain", item.key);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                  } catch {}
                  setDraggingKey(item.key);
                }}
                onDragOver={(e) => { e.preventDefault(); setOverKey(item.key); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingKey) reorder(draggingKey, item.key);
                  setDraggingKey(null);
                  setOverKey(null);
                }}
                onDragEnd={() => { setDraggingKey(null); setOverKey(null); }}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  e.preventDefault();
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                  setDraggingKey(item.key);
                  setOverKey(item.key);
                }}
                onPointerMove={(e) => {
                  if (!draggingKey || e.pointerType === "mouse") return;
                  e.preventDefault();
                  const container = modalListRef.current;
                  if (!container) return;
                  const nodes = Array.from(container.querySelectorAll<HTMLDivElement>('[data-customize-item]'));
                  const centers = nodes.map((n) => ({ key: n.getAttribute('data-key') as ViewKey, y: n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2 }));
                  const y = e.clientY;
                  let target = centers[0]?.key;
                  let min = Infinity;
                  for (const c of centers) {
                    const d = Math.abs(c.y - y);
                    if (d < min) { min = d; target = c.key; }
                  }
                  if (target && target !== overKey) setOverKey(target);
                }}
                  onPointerUp={(e) => {
                    if (!draggingKey) return;
                    const target = overKey ?? draggingKey;
                    if (target && draggingKey) reorder(draggingKey, target);
                    setDraggingKey(null);
                    setOverKey(null);
                    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                  }}
                  onPointerCancel={(e) => {
                    setDraggingKey(null);
                    setOverKey(null);
                    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 border border-[rgb(var(--border))] rounded-[var(--radius)] px-3 py-2 bg-[rgb(var(--surface))]",
                    overKey === item.key && draggingKey && draggingKey !== item.key ? "ring-2 ring-[rgb(var(--primary-soft))]" : undefined,
                  )}
                  data-customize-item
                  data-key={item.key}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-[rgb(var(--text-soft))] cursor-grab" />
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.preventDefault()}
                      className="p-1 rounded hover:bg-[rgb(var(--bg-muted))]"
                      onClick={() => move(item.key, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.preventDefault()}
                      className="p-1 rounded hover:bg-[rgb(var(--bg-muted))]"
                      onClick={() => move(item.key, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.preventDefault()}
                      className="p-1 rounded hover:bg-[rgb(var(--bg-muted))]"
                      onClick={() => toggleHidden(item.key)}
                      aria-label={prefs.hidden.includes(item.key) ? "Show" : "Hide"}
                    >
                      {prefs.hidden.includes(item.key) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
                <div className="flex items-center justify-between pt-2">
                  <button className="text-sm text-[rgb(var(--text-subtle))] hover:text-[rgb(var(--text))]" onClick={resetPrefs}>Reset</button>
                  <button
                    className="px-3 py-1.5 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white text-sm"
                    onClick={() => setCustomizeOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </nav>
  );
}
