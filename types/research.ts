import type { Attachment } from "./molt";

export type ResearchNote = {
  id: string;
  title: string;
  individualLabel?: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  externalSource?: string;
  externalId?: string;
  entryType?: string;
  url?: string;
  sourceMessageId?: string;
  sourceChannelId?: string;
  sourceGuildId?: string;
  authorId?: string;
  // Attachments & cover
  attachments?: Attachment[];
  coverIndex?: number;
  // E2E encryption fields
  isEncrypted?: boolean;
  encryptionSalt?: string;
  encryptionIV?: string;
};

export type ResearchStack = {
  id: string;
  name: string;
  species?: string;
  category?: string;
  description?: string;
  tags: string[];
  notes: ResearchNote[];
  createdAt: string;
  updatedAt: string;
  externalSource?: string;
  externalId?: string;
  isPublic?: boolean;
  alias?: string;
  saveCount?: number;
  // E2E encryption: when true, all notes in this stack are encrypted
  isEncryptedStack?: boolean;
};
