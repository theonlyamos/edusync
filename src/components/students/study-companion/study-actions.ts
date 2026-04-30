import { BookOpen, Brain, HelpCircle, ListChecks, Route, Sparkles, type LucideIcon } from 'lucide-react';
import type { StudyIntent, StudyMode } from './types';

export interface QuickAction {
  label: string;
  description: string;
  intent: StudyIntent;
  mode: StudyMode;
  prompt: string;
  icon: LucideIcon;
}

export const quickActions: QuickAction[] = [
  {
    label: 'Plan my session',
    description: 'Set a goal and divide study time.',
    intent: 'plan',
    mode: 'companion',
    prompt: 'Help me make a focused study plan for this session. Ask me what I need to work on first if needed.',
    icon: Route,
  },
  {
    label: 'Quiz me',
    description: 'Practice active recall.',
    intent: 'quiz',
    mode: 'companion',
    prompt: 'Quiz me on this topic one question at a time. Wait for my answer before giving feedback.',
    icon: ListChecks,
  },
  {
    label: 'Give me a hint',
    description: 'Nudge me without solving it.',
    intent: 'hint',
    mode: 'companion',
    prompt: 'Give me a hint using the smallest useful nudge. Do not give the full answer unless I ask.',
    icon: HelpCircle,
  },
  {
    label: 'Explain this',
    description: 'Switch into tutor mode.',
    intent: 'explain',
    mode: 'tutor',
    prompt: 'Explain this clearly at my grade level, then check my understanding with one short question.',
    icon: BookOpen,
  },
  {
    label: 'Walk me through it',
    description: 'Step-by-step guided help.',
    intent: 'walkthrough',
    mode: 'tutor',
    prompt: 'Walk me through this step by step. Pause after each major step so I can try the next part.',
    icon: Brain,
  },
  {
    label: 'Review weak topics',
    description: 'Find what needs practice.',
    intent: 'review',
    mode: 'companion',
    prompt: 'Help me review weak spots from this lesson or conversation. Turn them into a short practice plan.',
    icon: Sparkles,
  },
];
