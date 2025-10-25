"use client";

import { useState, useEffect } from "react";
import { X, Upload, Trash2, Calendar, Droplets, Thermometer } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { FormState, Attachment, Stage, FeedingOutcome } from "@/types/molt";
import Image from "next/image";

interface EntryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  formState: FormState;
  onFormChange: (updates: Partial<FormState>) => void;
  onSubmit: () => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  isEditing: boolean;
}

export default function EntryFormModal({
  isOpen,
  onClose,
  formState,
  onFormChange,
  onSubmit,
  attachments,
  onAttachmentsChange,
  isEditing,
}: EntryFormModalProps) {
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    // Prevent body scroll when modal is open
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);

    try {
      const newAttachments: Attachment[] = [];

      for (const file of Array.from(files)) {
        // In a real app, you'd upload to a server/CDN
        // For now, create a local URL
        const url = URL.createObjectURL(file);
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          name: file.name,
          url,
          type: file.type,
          addedAt: new Date().toISOString(),
        };
        newAttachments.push(attachment);
      }

      onAttachmentsChange([...attachments, ...newAttachments]);
    } catch (error) {
      console.error("Error uploading files:", error);
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const isMolt = formState.entryType === "molt";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] max-w-full bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)] z-[70] overflow-hidden flex flex-col animate-slide-up sm:animate-[slide-in-from-right_0.3s_ease-out] overscroll-y-contain overscroll-x-none touch-pan-y">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <h2 className="text-xl font-bold text-[rgb(var(--text))]">
            {isEditing ? "Edit Entry" : "New Entry"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 space-y-4 min-w-0">
            {/* Entry Type Toggle */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-2 block">
                Entry Type
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isMolt ? "primary" : "secondary"}
                  onClick={() => onFormChange({ entryType: "molt" })}
                  className="flex-1"
                >
                  Molt
                </Button>
                <Button
                  type="button"
                  variant={!isMolt ? "primary" : "secondary"}
                  onClick={() => onFormChange({ entryType: "feeding" })}
                  className="flex-1"
                >
                  Feeding
                </Button>
              </div>
            </div>

            {/* Specimen Name */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Specimen Name *
              </label>
              <Input
                required
                placeholder="e.g., Rosie, Spider #1"
                value={formState.specimen}
                onChange={(e) => onFormChange({ specimen: e.target.value })}
              />
            </div>

            {/* Species (required for molts) */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Species {isMolt && "*"}
              </label>
              <Input
                required={isMolt}
                placeholder="e.g., Brachypelma hamorii"
                value={formState.species}
                onChange={(e) => onFormChange({ species: e.target.value })}
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date
              </label>
              <Input
                type="date"
                value={formState.date}
                onChange={(e) => onFormChange({ date: e.target.value })}
              />
            </div>

            {/* Molt-specific fields */}
            {isMolt && (
              <>
                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                    Molt Stage
                  </label>
                  <select
                    value={formState.stage}
                    onChange={(e) => onFormChange({ stage: e.target.value as Stage })}
                    className="select"
                  >
                    <option value="Pre-molt">Pre-molt</option>
                    <option value="Molt">Molt</option>
                    <option value="Post-molt">Post-molt</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                      Old Size (cm)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0.0"
                      value={formState.oldSize}
                      onChange={(e) => onFormChange({ oldSize: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                      New Size (cm)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0.0"
                      value={formState.newSize}
                      onChange={(e) => onFormChange({ newSize: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Feeding-specific fields */}
            {!isMolt && (
              <>
                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                    Prey Offered
                  </label>
                  <Input
                    placeholder="e.g., Cricket, Roach"
                    value={formState.feedingPrey}
                    onChange={(e) => onFormChange({ feedingPrey: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                    Outcome
                  </label>
                  <select
                    value={formState.feedingOutcome}
                    onChange={(e) =>
                      onFormChange({ feedingOutcome: e.target.value as FeedingOutcome })
                    }
                    className="select"
                  >
                    <option value="">Select outcome</option>
                    <option value="Offered">Offered</option>
                    <option value="Ate">Ate</option>
                    <option value="Refused">Refused</option>
                    <option value="Not Observed">Not Observed</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                    Quantity/Size
                  </label>
                  <Input
                    placeholder="e.g., 1 adult, 2 medium"
                    value={formState.feedingAmount}
                    onChange={(e) => onFormChange({ feedingAmount: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Environmental conditions */}
            <div className="pt-2 border-t border-[rgb(var(--border))]">
              <h3 className="text-sm font-medium text-[rgb(var(--text))] mb-3">
                Environmental Conditions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block flex items-center gap-1.5">
                    <Droplets className="w-4 h-4" />
                    Humidity (%)
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formState.humidity}
                    onChange={(e) => onFormChange({ humidity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4" />
                    Temp (°C)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={formState.temperature}
                    onChange={(e) => onFormChange({ temperature: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Notes
              </label>
              <textarea
                className="textarea"
                rows={4}
                placeholder="Additional observations..."
                value={formState.notes}
                onChange={(e) => onFormChange({ notes: e.target.value })}
              />
            </div>

            {/* Reminder Date */}
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Set Reminder
              </label>
              <Input
                type="date"
                value={formState.reminderDate}
                onChange={(e) => onFormChange({ reminderDate: e.target.value })}
              />
            </div>

            {/* Photo Attachments */}
            <div className="pt-2 border-t border-[rgb(var(--border))]">
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-2 block">
                Photo Attachments
              </label>
              <div className="space-y-3">
                <label className="block">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full gap-2"
                    disabled={uploadingFiles}
                    onClick={(e) => {
                      e.preventDefault();
                      (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                    }}
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingFiles ? "Uploading..." : "Upload Photos"}
                  </Button>
                </label>

                {attachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="relative group aspect-square rounded-[var(--radius)] overflow-hidden bg-[rgb(var(--bg-muted))]"
                      >
                        <Image
                          src={attachment.url}
                          alt={attachment.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 120px"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-[rgb(var(--danger))] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] flex gap-2 safe-bottom">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onSubmit} className="flex-1">
            {isEditing ? "Save Changes" : "Create Entry"}
          </Button>
        </div>
      </div>
    </>
  );
}
