export type StudyMode = 'companion' | 'tutor';

export type StudyIntent = 'general' | 'plan' | 'hint' | 'explain' | 'quiz' | 'review' | 'walkthrough';

export interface SuggestedAction {
  label: string;
  intent: StudyIntent;
  prompt: string;
}

export interface StudyMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  lessonId?: string;
  followUpQuestions?: string[];
  suggestedActions?: SuggestedAction[];
  mode?: StudyMode;
  intent?: StudyIntent;
  confidence?: 'shaky' | 'okay' | 'confident' | 'mastered';
}

export interface ChatHistory {
  _id?: string;
  id?: string;
  title: string;
  messages?: StudyMessage[];
  userId: string;
  lessonId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  _id?: string;
  id?: string;
  title: string;
  subject: string;
  gradeLevel?: string;
  gradelevel?: string;
}

export const getChatId = (chat: Pick<ChatHistory, '_id' | 'id'>) => chat._id ?? chat.id ?? '';

export const getLessonId = (lesson: Pick<Lesson, '_id' | 'id'>) => lesson._id ?? lesson.id ?? '';
