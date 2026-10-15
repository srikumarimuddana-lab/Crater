export const JOURNAL_STORIES = [
  {key:'journal-article-1',slug:'making-room-for-a-daily-ritual',legacyIndex:0},
  {key:'journal-article-2',slug:'a-routine-that-feels-like-you',legacyIndex:1},
  {key:'journal-article-3',slug:'the-art-of-slowing-down',legacyIndex:2},
] as const;
export type JournalStory = typeof JOURNAL_STORIES[number];
