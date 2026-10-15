export type ChatQuestion = {
  id: string;
  label: string;
  answer: string;
  href: string | null;
};
export type ChatConfig = {
  enabled: boolean;
  title: string;
  greeting: string;
  fallback: string;
  followUpLabel: string;
  allowedPaths: string[];
  retentionDays: number;
  questions: ChatQuestion[];
};
export type ChatMessage = {
  id: string;
  sessionId: string;
  requestId: string;
  kind: 'question' | 'answer' | 'fallback' | 'handoff';
  body: string;
  href?: string | null;
  createdAt: string;
};
export type ChatState = {
  draft: ChatConfig | null;
  published: ChatConfig | null;
  version: number;
  sessions: {
    id: string;
    tokenHash: string;
    expiresAt: string;
    messages: ChatMessage[];
  }[];
  handoffs: {
    id: string;
    sessionId: string;
    email: string;
    name: string;
    body: string;
    createdAt: string;
    processed: boolean;
    customerId?: string;
  }[];
  audit: { actor: string; action: string; at: string }[];
};
