"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Folder,
  FileText,
  Tag,
  Edit2,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ResearchStack, ResearchNote } from "@/types/research";
import { cn } from "@/lib/utils";

interface NotebookViewProps {
  stacks: ResearchStack[];
  selectedStackId: string | null;
  onSelectStack: (id: string | null) => void;
  onCreateStack: (stack: Partial<ResearchStack>) => void;
  onUpdateStack: (id: string, updates: Partial<ResearchStack>) => void;
  onDeleteStack: (id: string) => void;
  onCreateNote: (stackId: string, note: Partial<ResearchNote>) => void;
  onUpdateNote: (stackId: string, noteId: string, updates: Partial<ResearchNote>) => void;
  onDeleteNote: (stackId: string, noteId: string) => void;
  onDuplicateNote: (stackId: string, noteId: string) => void;
}

export default function NotebookView({
  stacks,
  selectedStackId,
  onSelectStack,
  onCreateStack,
  onUpdateStack,
  onDeleteStack,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onDuplicateNote,
}: NotebookViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    species: "",
    category: "",
    description: "",
  });

  const categories = useMemo(() => {
    const cats = new Set<string>();
    stacks.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [stacks]);

  const filteredStacks = useMemo(() => {
    let filtered = [...stacks];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.species?.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((s) => s.category === categoryFilter);
    }

    return filtered.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [stacks, searchQuery, categoryFilter]);

  const [editingStackId, setEditingStackId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    species: "",
    category: "",
    description: "",
  });

  const handleCreateStack = useCallback(() => {
    if (!createForm.name.trim()) return;

    onCreateStack({
      name: createForm.name.trim(),
      species: createForm.species.trim() || undefined,
      category: createForm.category.trim() || undefined,
      description: createForm.description.trim() || undefined,
      tags: [],
      notes: [],
    });

    setCreateForm({ name: "", species: "", category: "", description: "" });
    setIsCreating(false);
  }, [createForm, onCreateStack]);

  const handleCreateNote = useCallback(() => {
    if (!selectedStackId) return;

    onCreateNote(selectedStackId, {
      title: "New Note",
      content: "",
      tags: [],
    });
  }, [onCreateNote, selectedStackId]);

  if (stacks.length === 0 && !isCreating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgb(var(--primary-soft))] flex items-center justify-center mb-4">
          <BookOpen className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">
          Research Notebook
        </h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md mb-6">
          Create stacks to organize research notes by species, project, or individual specimens.
        </p>
        <Button variant="primary" onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Your First Stack
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[rgb(var(--text))]">Research Notebook</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsCreating(true)}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New Stack
        </Button>
      </div>

      {/* Create Stack Form */}
      {isCreating && (
        <Card className="p-4 animate-slide-down">
          <div className="space-y-3">
            <h3 className="font-semibold text-[rgb(var(--text))]">Create New Stack</h3>
            <Input
              placeholder="Stack name *"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
            <Input
              placeholder="Species (optional)"
              value={createForm.species}
              onChange={(e) => setCreateForm({ ...createForm, species: e.target.value })}
            />
            <Input
              placeholder="Category (optional)"
              value={createForm.category}
              onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
            />
            <textarea
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="textarea"
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleCreateStack} disabled={!createForm.name.trim()}>
                Create Stack
              </Button>
              <Button variant="ghost" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {stacks.length > 0 && (
        <>
          {/* Search & Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                placeholder="Search stacks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                <Button
                  variant={categoryFilter === "all" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setCategoryFilter("all")}
                >
                  All
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Stack List */}
          <div className="space-y-3">
            {filteredStacks.map((stack) => {
              const isSelected = stack.id === selectedStackId;

              return (
                <Card key={stack.id} className={cn(
                  "overflow-hidden transition-all",
                  isSelected && "ring-2 ring-[rgb(var(--primary))]"
                )}>
                  {/* Stack Header */}
                  <button
                    onClick={() => onSelectStack(isSelected ? null : stack.id)}
                    className="w-full p-4 text-left hover:bg-[rgb(var(--bg-muted))] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-[var(--radius)] bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))] shrink-0">
                        {isSelected ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-[rgb(var(--text))] truncate flex items-center gap-1.5">
                            <Folder className="w-4 h-4 text-[rgb(var(--text-subtle))]" />
                            {stack.name}
                          </h3>
                          {stack.category && (
                            <Badge variant="neutral" className="shrink-0">
                              {stack.category}
                            </Badge>
                          )}
                        </div>
                        {stack.species && (
                          <p className="text-sm text-[rgb(var(--text-soft))] italic mb-1">
                            {stack.species}
                          </p>
                        )}
                        {stack.description && (
                          <p className="text-sm text-[rgb(var(--text-soft))] line-clamp-2 mb-2">
                            {stack.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-[rgb(var(--text-subtle))]">
                          <div className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>{stack.notes.length} notes</span>
                          </div>
                          {stack.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              <span>{stack.tags.length} tags</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded Stack Content */}
                  {isSelected && (
                    <div className="border-t border-[rgb(var(--border))] p-4 space-y-4 animate-slide-down bg-[rgb(var(--bg-muted))]/50">
                      {/* Add Note Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCreateNote}
                        className="w-full gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Add Note
                      </Button>

                      {/* Edit Stack */}
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            if (editingStackId === stack.id) {
                              setEditingStackId(null);
                            } else {
                              setEditingStackId(stack.id);
                              setEditForm({
                                name: stack.name,
                                species: stack.species || "",
                                category: stack.category || "",
                                description: stack.description || "",
                              });
                            }
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                          {editingStackId === stack.id ? "Close Edit" : "Edit Stack"}
                        </Button>
                      </div>

                      {editingStackId === stack.id && (
                        <div className="space-y-3 p-3 rounded-[var(--radius)] bg-[rgb(var(--surface))] border border-[rgb(var(--border))]">
                          <Input
                            placeholder="Stack name *"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                          <Input
                            placeholder="Species (optional)"
                            value={editForm.species}
                            onChange={(e) => setEditForm({ ...editForm, species: e.target.value })}
                          />
                          <Input
                            placeholder="Category (optional)"
                            value={editForm.category}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          />
                          <textarea
                            placeholder="Description (optional)"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="textarea"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                onUpdateStack(stack.id, {
                                  name: editForm.name.trim() || stack.name,
                                  species: editForm.species.trim() || undefined,
                                  category: editForm.category.trim() || undefined,
                                  description: editForm.description.trim() || undefined,
                                });
                                setEditingStackId(null);
                              }}
                              disabled={!editForm.name.trim()}
                            >
                              Save Changes
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingStackId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Notes List */}
                      {stack.notes.length > 0 ? (
                        <div className="space-y-3">
                          {stack.notes.map((note) => (
                            <Card key={note.id} className="p-3">
                              <div className="space-y-2">
                                <Input
                                  value={note.title}
                                  onChange={(e) =>
                                    onUpdateNote(stack.id, note.id, { title: e.target.value })
                                  }
                                  className="font-medium"
                                />
                                {note.individualLabel && (
                                  <Input
                                    value={note.individualLabel}
                                    onChange={(e) =>
                                      onUpdateNote(stack.id, note.id, {
                                        individualLabel: e.target.value,
                                      })
                                    }
                                    placeholder="Individual label"
                                    className="text-sm"
                                  />
                                )}
                                <textarea
                                  value={note.content}
                                  onChange={(e) =>
                                    onUpdateNote(stack.id, note.id, { content: e.target.value })
                                  }
                                  placeholder="Note content..."
                                  className="textarea"
                                  rows={4}
                                />
                                {note.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {note.tags.map((tag, idx) => (
                                      <Badge key={idx} variant="primary">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2 pt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDuplicateNote(stack.id, note.id)}
                                    className="gap-1.5"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Duplicate
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDeleteNote(stack.id, note.id)}
                                    className="gap-1.5 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-sm text-[rgb(var(--text-soft))] py-4">
                          No notes yet. Click &quot;Add Note&quot; to get started.
                        </p>
                      )}

                      {/* Stack Actions */}
                      <div className="pt-3 border-t border-[rgb(var(--border))] flex gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete stack &quot;${stack.name}&quot;?`)) {
                              onDeleteStack(stack.id);
                              onSelectStack(null);
                            }
                          }}
                          className="gap-1.5"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete Stack
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {filteredStacks.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[rgb(var(--text-soft))]">No stacks match your search</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
