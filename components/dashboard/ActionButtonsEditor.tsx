
import { useState } from "react";
import { X, Plus, RotateCcw, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ActionButton } from "@/hooks/useActionButtons";

interface ActionButtonsEditorProps {
    buttons: ActionButton[];
    onAdd: (label: string) => void;
    onRemove: (id: string) => void;
    onToggle: (id: string) => void;
    onClose: () => void;
}

export default function ActionButtonsEditor({
    buttons,
    onAdd,
    onRemove,
    onToggle,
    onClose
}: ActionButtonsEditorProps) {
    const [newLabel, setNewLabel] = useState("");

    const handleAdd = () => {
        if (newLabel.trim()) {
            onAdd(newLabel.trim());
            setNewLabel("");
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)] flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))]">
                    <h3 className="font-bold text-lg">Customize Actions</h3>
                    <button onClick={onClose} className="p-1 rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))]">
                        <X className="w-5 h-5 text-[rgb(var(--text-soft))]" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-4">

                    {/* Add New */}
                    <div className="flex gap-2">
                        <Input
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="New action (e.g. 'misted')"
                            className="flex-1"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd();
                            }}
                        />
                        <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim()}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase text-[rgb(var(--text-subtle))] tracking-wider">
                            Enabled Buttons
                        </div>
                        {buttons.filter(b => b.enabled).length === 0 && (
                            <div className="text-sm text-[rgb(var(--text-soft))] italic">No buttons enabled.</div>
                        )}
                        {buttons.filter(b => b.enabled).map(button => (
                            <div key={button.id} className="flex items-center justify-between p-2 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] border border-[rgb(var(--border))]">
                                <span className="font-medium text-sm">{button.label}</span>
                                <div className="flex items-center gap-1">
                                    {button.type === 'default' ? (
                                        <button
                                            onClick={() => onToggle(button.id)}
                                            className="p-1.5 text-[rgb(var(--text-soft))] hover:text-[rgb(var(--danger))] hover:bg-[rgb(var(--surface))]"
                                            title="Hide"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onRemove(button.id)}
                                            className="p-1.5 text-[rgb(var(--text-soft))] hover:text-[rgb(var(--danger))] hover:bg-[rgb(var(--surface))]"
                                            title="Delete"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Disabled Defaults */}
                    {buttons.some(b => !b.enabled && b.type === 'default') && (
                        <div className="space-y-2 pt-2 border-t border-[rgb(var(--border))]">
                            <div className="text-xs font-semibold uppercase text-[rgb(var(--text-subtle))] tracking-wider">
                                Hidden Defaults
                            </div>
                            {buttons.filter(b => !b.enabled && b.type === 'default').map(button => (
                                <div key={button.id} className="flex items-center justify-between p-2 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] opacity-75">
                                    <span className="text-sm text-[rgb(var(--text-soft))]">{button.label}</span>
                                    <button
                                        onClick={() => onToggle(button.id)}
                                        className="p-1.5 text-[rgb(var(--primary))] hover:bg-[rgb(var(--surface))]"
                                        title="Show"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[rgb(var(--border))]">
                    <Button className="w-full" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}
