
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export type ActionButton = {
    id: string;
    label: string;
    type: "default" | "custom";
    enabled: boolean;
    usageCount: number;
    lastUsedAt?: string; // ISO date
};

const DEFAULT_ACTIONS: ActionButton[] = [
    { id: "watered", label: "watered", type: "default", enabled: true, usageCount: 0 },
    { id: "seen", label: "seen", type: "default", enabled: true, usageCount: 0 },
    { id: "hidden", label: "hidden", type: "default", enabled: true, usageCount: 0 },
    { id: "threat", label: "threat posed", type: "default", enabled: true, usageCount: 0 },
    { id: "stress", label: "stress response", type: "default", enabled: true, usageCount: 0 },
    { id: "webbed", label: "webbed increase", type: "default", enabled: true, usageCount: 0 },
    { id: "burrowed", label: "burrowed", type: "default", enabled: true, usageCount: 0 },
];

const LOCAL_STORAGE_KEY = "moltly:action-buttons-v2";

export function useActionButtons() {
    const { data: session, status } = useSession();
    const [buttons, setButtons] = useState<ActionButton[]>(DEFAULT_ACTIONS);
    const [loading, setLoading] = useState(true);

    // Load from API or LocalStorage
    useEffect(() => {
        let mounted = true;

        async function load() {
            if (status === "loading") return;

            if (status === "authenticated") {
                try {
                    const res = await fetch("/api/account/preferences");
                    if (res.ok) {
                        const data = await res.json();
                        if (data.actionButtons?.items?.length) {
                            // Merge with defaults to ensure all defaults are present (in case of new ones)
                            const remoteItems = data.actionButtons.items as ActionButton[];
                            const merged = [...remoteItems];

                            // Add any missing defaults that aren't in remote (maybe new app version)
                            DEFAULT_ACTIONS.forEach(def => {
                                if (!merged.find(m => m.id === def.id)) {
                                    merged.push(def);
                                }
                            });

                            if (mounted) setButtons(merged);
                            return;
                        }
                    }
                } catch (e) {
                    console.error("Failed to load request preferences", e);
                }
            }

            // Fallback to local storage
            const local = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (local) {
                try {
                    const parsed = JSON.parse(local);
                    if (Array.isArray(parsed)) {
                        if (mounted) setButtons(parsed);
                        return;
                    }
                } catch { }
            } else {
                // Try migrating legacy custom actions
                const legacy = window.localStorage.getItem("moltly:custom-actions");
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            const migrated: ActionButton[] = [...DEFAULT_ACTIONS];
                            parsed.forEach((label: string) => {
                                if (typeof label === 'string' && label.trim()) {
                                    if (!migrated.find(b => b.label === label.trim())) {
                                        migrated.push({
                                            id: crypto.randomUUID(),
                                            label: label.trim(),
                                            type: "custom",
                                            enabled: true,
                                            usageCount: 0
                                        });
                                    }
                                }
                            });
                            if (mounted) setButtons(migrated);
                            // Save immediately to new format
                            window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(migrated));
                            return;
                        }
                    } catch { }
                }
            }

            // If no local or remote, use defaults (already set)
            if (mounted) setLoading(false);
        }

        load().finally(() => {
            if (mounted) setLoading(false);
        });

        return () => { mounted = false; };
    }, [status]);

    // Save changes
    const save = useCallback(async (newButtons: ActionButton[]) => {
        setButtons(newButtons);

        // Always save to local storage as backup/latency compensation
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newButtons));

        if (status === "authenticated") {
            try {
                await fetch("/api/account/preferences", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ actionButtons: { items: newButtons } }),
                });
            } catch (e) {
                console.error("Failed to save preferences", e);
            }
        }
    }, [status]);

    const addCustomButton = useCallback((label: string) => {
        const trimmed = label.trim();
        if (!trimmed) return;

        setButtons(prev => {
            if (prev.find(b => b.label.toLowerCase() === trimmed.toLowerCase())) return prev;
            const newBtn: ActionButton = {
                id: crypto.randomUUID(),
                label: trimmed,
                type: "custom",
                enabled: true,
                usageCount: 0,
                lastUsedAt: new Date().toISOString()
            };
            const next = [...prev, newBtn];
            save(next);
            return next;
        });
    }, [save]);

    const removeButton = useCallback((id: string) => {
        setButtons(prev => {
            // For custom buttons, remove them. For default, just disable them? 
            // Or maybe strictly remove custom ones. 
            // Let's assume we can remove custom ones. Default ones we toggle visibility.
            const target = prev.find(b => b.id === id);
            if (target && target.type === "default") {
                // Toggle off
                const next = prev.map(b => b.id === id ? { ...b, enabled: false } : b);
                save(next);
                return next;
            }
            const next = prev.filter(b => b.id !== id);
            save(next);
            return next;
        });
    }, [save]);

    const toggleButton = useCallback((id: string) => {
        setButtons(prev => {
            const next = prev.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b);
            save(next);
            return next;
        });
    }, [save]);

    const trackUsage = useCallback((id: string) => {
        setButtons(prev => {
            const next = prev.map(b => {
                if (b.id === id) {
                    return {
                        ...b,
                        usageCount: (b.usageCount || 0) + 1,
                        lastUsedAt: new Date().toISOString()
                    };
                }
                return b;
            });
            // We don't await this save to avoid lag, fire and forget
            save(next);
            return next;
        });
    }, [save]);

    const sortedButtons = [...buttons]
        .filter(b => b.enabled)
        .sort((a, b) => {
            // Sort by usage count descending
            return (b.usageCount || 0) - (a.usageCount || 0);
        });

    return {
        buttons,
        sortedButtons,
        loading,
        addCustomButton,
        removeButton,
        toggleButton,
        trackUsage
    };
}
