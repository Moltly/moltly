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
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showStackPicker, setShowStackPicker] = useState(false);
  const [stackPickerQuery, setStackPickerQuery] = useState("");
  const [noteQuery, setNoteQuery] = useState("");

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

  const selectedStack = useMemo(
    () => filteredStacks.find((s) => s.id === selectedStackId) ?? null,
    [filteredStacks, selectedStackId]
  );

  const filteredNotes = useMemo(() => {
    if (!selectedStack) return [] as ResearchNote[];
    if (!noteQuery.trim()) return selectedStack.notes;
    const q = noteQuery.toLowerCase();
    return selectedStack.notes.filter((n) =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.individualLabel || "").toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q) ||
      (n.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [selectedStack, noteQuery]);

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
    onCreateNote(selectedStackId, { title: "New Note", content: "", tags: [] });
    // Focus first note for quick editing
    setTimeout(() => {
      const firstId = stacks.find((s) => s.id === selectedStackId)?.notes[0]?.id;
      if (firstId) setEditingNoteId(firstId);
    }, 0);
  }, [onCreateNote, selectedStackId, stacks]);

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
    <div className="space-y-4 pb-24 md:pb-4">
      {/* Header */}
      <div className="hidden md:flex items-center justify-between">
        <h2 className="text-xl font-bold text-[rgb(var(--text))]">Research Notebook</h2>
        <Button variant="primary" size="sm" onClick={() => setIsCreating(true)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          New Stack
        </Button>
      </div>

      {/* Mobile header: stack selector and quick action */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => setShowStackPicker(true)}
          >
            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="truncate flex-1 min-w-0">{selectedStack ? selectedStack.name : "Select a stack"}</span>
              <span className="text-[rgb(var(--text-subtle))] shrink-0">({stacks.length})</span>
            </div>
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreateNote} disabled={!selectedStack}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {!selectedStack && (
          <p className="text-xs text-[rgb(var(--text-subtle))]">Pick a stack to view notes.</p>
        )}
      </div>

      {/* Create Stack - minimal by default */}
      {isCreating && (
        <Card className="p-4 animate-slide-down">
          <div className="space-y-3">
            <h3 className="font-semibold text-[rgb(var(--text))]">Create New Stack</h3>
            <Input
              placeholder="Stack name *"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
            {!showAdvancedCreate ? (
              <div className="flex items-center justify-between">
                <Button
                  variant="primary"
                  onClick={handleCreateStack}
                  disabled={!createForm.name.trim()}
                >
                  Create Stack
                </Button>
                <Button variant="ghost" onClick={() => setShowAdvancedCreate(true)}>
                  Add details
                </Button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </Card>
      )}

      {/* Main area: two-pane on md+ */}
      {stacks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left: stacks list, search & filters */}
          <div className="hidden md:block md:col-span-5 lg:col-span-4 space-y-3">
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
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
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

            <div className="space-y-2">
              {filteredStacks.map((stack) => {
                const isSelected = stack.id === selectedStackId;
                return (
                  <Card
                    key={stack.id}
                    className={cn(
                      "p-3 hover:bg-[rgb(var(--bg-muted))] transition-colors cursor-pointer",
                      isSelected && "ring-2 ring-[rgb(var(--primary))]"
                    )}
                    onClick={() => onSelectStack(stack.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-[var(--radius)] bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))] shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[rgb(var(--text))] truncate">{stack.name}</h3>
                          {stack.category && <Badge variant="neutral" className="shrink-0">{stack.category}</Badge>}
                        </div>
                        {stack.species && (
                          <p className="text-sm text-[rgb(var(--text-soft))] italic truncate">{stack.species}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-[rgb(var(--text-subtle))] mt-1">
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
                  </Card>
                );
              })}

              {filteredStacks.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[rgb(var(--text-soft))]">No stacks match your search</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: selected stack detail + notes */}
          <div className="md:col-span-7 lg:col-span-8 space-y-3">
            {!selectedStack ? (
              <Card className="p-6 text-center">
                <p className="text-[rgb(var(--text-soft))]">Select a stack to view its notes.</p>
              </Card>
            ) : (
              <>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-[rgb(var(--text))] truncate">{selectedStack.name}</h3>
                        {selectedStack.category && (
                          <Badge variant="neutral" className="shrink-0">{selectedStack.category}</Badge>
                        )}
                      </div>
                      {selectedStack.species && (
                        <p className="text-sm text-[rgb(var(--text-soft))] italic mb-1 truncate">{selectedStack.species}</p>
                      )}
                      {selectedStack.description && (
                        <p className="text-sm text-[rgb(var(--text-soft))] whitespace-pre-line">{selectedStack.description}</p>
                      )}
                    </div>
                    <div className="hidden md:flex gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCreateNote}
                        className="gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Add Note
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          if (editingStackId === selectedStack.id) {
                            setEditingStackId(null);
                          } else {
                            setEditingStackId(selectedStack.id);
                            setEditForm({
                              name: selectedStack.name,
                              species: selectedStack.species || "",
                              category: selectedStack.category || "",
                              description: selectedStack.description || "",
                            });
                          }
                        }}
                      >
                        <Edit2 className="w-3 h-3" />
                        {editingStackId === selectedStack.id ? "Close Edit" : "Edit Stack"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          if (confirm(`Delete stack "${selectedStack.name}"?`)) {
                            onDeleteStack(selectedStack.id);
                            onSelectStack(null);
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Mobile actions below title to keep names visible */}
                  <div className="flex gap-2 mt-2 md:hidden">
                    <Button variant="secondary" size="sm" onClick={handleCreateNote} className="gap-1.5">
                      <Plus className="w-4 h-4" /> Note
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        if (editingStackId === selectedStack.id) {
                          setEditingStackId(null);
                        } else {
                          setEditingStackId(selectedStack.id);
                          setEditForm({
                            name: selectedStack.name,
                            species: selectedStack.species || "",
                            category: selectedStack.category || "",
                            description: selectedStack.description || "",
                          });
                        }
                      }}
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete stack "${selectedStack.name}"?`)) {
                          onDeleteStack(selectedStack.id);
                          onSelectStack(null);
                        }
                      }}
                      className="gap-1.5 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  </div>

                  {editingStackId === selectedStack.id && (
                    <div className="mt-3 space-y-3 p-3 rounded-[var(--radius)] bg-[rgb(var(--surface))] border border-[rgb(var(--border))]">
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
                            onUpdateStack(selectedStack.id, {
                              name: editForm.name.trim() || selectedStack.name,
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
                </Card>

                {/* Notes search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
                  <Input
                    placeholder="Search notes..."
                    value={noteQuery}
                    onChange={(e) => setNoteQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Notes */}
                {filteredNotes.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-[rgb(var(--text-soft))] mb-3">No notes match your search.</p>
                    <Button variant="secondary" onClick={handleCreateNote} className="gap-1.5">
                      <Plus className="w-4 h-4" /> Add your first note
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredNotes.map((note) => {
                      const isEditing = editingNoteId === note.id;
                      return (
                        <Card key={note.id} className="p-3">
                          {!isEditing ? (
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(note.id)}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="font-medium truncate">{note.title || "Untitled note"}</h4>
                                  {note.individualLabel && (
                                    <p className="text-xs text-[rgb(var(--text-subtle))] mt-0.5 truncate">
                                      {note.individualLabel}
                                    </p>
                                  )}
                                  {note.content && (
                                    <p className="text-sm text-[rgb(var(--text-soft))] line-clamp-2 mt-1 whitespace-pre-line">
                                      {note.content}
                                    </p>
                                  )}
                                  {note.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {note.tags.map((tag, idx) => (
                                        <Badge key={idx} variant="primary">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="hidden md:flex gap-2 shrink-0">
                                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditingNoteId(note.id)}>
                                    <Edit2 className="w-3 h-3" /> Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDuplicateNote(selectedStack.id, note.id)}
                                    className="gap-1.5"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Duplicate
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDeleteNote(selectedStack.id, note.id)}
                                    className="gap-1.5 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                              {/* Mobile note actions below to avoid squeezing the title */}
                              <div className="flex gap-2 mt-2 md:hidden">
                                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditingNoteId(note.id)}>
                                  <Edit2 className="w-3 h-3" /> Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDuplicateNote(selectedStack.id, note.id)}
                                  className="gap-1.5"
                                >
                                  <Copy className="w-3 h-3" />
                                  Duplicate
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDeleteNote(selectedStack.id, note.id)}
                                  className="gap-1.5 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </Button>
                              </div>
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                value={note.title}
                                onChange={(e) => onUpdateNote(selectedStack.id, note.id, { title: e.target.value })}
                                className="font-medium"
                              />
                              <Input
                                value={note.individualLabel || ""}
                                onChange={(e) =>
                                  onUpdateNote(selectedStack.id, note.id, { individualLabel: e.target.value || undefined })
                                }
                                placeholder="Individual label (optional)"
                                className="text-sm"
                              />
                              <textarea
                                value={note.content}
                                onChange={(e) => onUpdateNote(selectedStack.id, note.id, { content: e.target.value })}
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
                              <div className="flex gap-2 pt-1">
                                <Button variant="primary" size="sm" onClick={() => setEditingNoteId(null)}>
                                  Done
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDuplicateNote(selectedStack.id, note.id)}
                                  className="gap-1.5"
                                >
                                  <Copy className="w-3 h-3" />
                                  Duplicate
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDeleteNote(selectedStack.id, note.id)}
                                  className="gap-1.5 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile: Stack Picker Overlay */}
      {showStackPicker && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end md:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowStackPicker(false)}
        >
          <div
            className="w-full max-h-[85dvh] bg-[rgb(var(--surface))] rounded-t-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Select Stack</h3>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsCreating(true)}>New</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowStackPicker(false)}>
                  Close
                </Button>
              </div>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                placeholder="Search stacks..."
                value={stackPickerQuery}
                onChange={(e) => setStackPickerQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="overflow-y-auto min-h-0 space-y-2">
              {(stackPickerQuery ? filteredStacks.filter((s) => {
                const q = stackPickerQuery.toLowerCase();
                return (
                  s.name.toLowerCase().includes(q) ||
                  (s.species || "").toLowerCase().includes(q) ||
                  (s.category || "").toLowerCase().includes(q)
                );
              }) : filteredStacks).map((stack) => (
                <Card
                  key={stack.id}
                  className={cn(
                    "p-3 hover:bg-[rgb(var(--bg-muted))] transition-colors cursor-pointer",
                    selectedStackId === stack.id && "ring-2 ring-[rgb(var(--primary))]"
                  )}
                  onClick={() => {
                    onSelectStack(stack.id);
                    setShowStackPicker(false);
                    setEditingNoteId(null);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-[var(--radius)] bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))] shrink-0">
                      <Folder className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{stack.name}</h4>
                        {stack.category && (
                          <Badge variant="neutral" className="shrink-0">{stack.category}</Badge>
                        )}
                      </div>
                      {stack.species && (
                        <p className="text-sm text-[rgb(var(--text-soft))] italic truncate">{stack.species}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-[rgb(var(--text-subtle))] mt-1">
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
                </Card>
              ))}
              {filteredStacks.length === 0 && (
                <p className="text-center text-[rgb(var(--text-soft))] py-8">No stacks</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
