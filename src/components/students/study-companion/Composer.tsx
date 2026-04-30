'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { StudyIntent, StudyMode } from './types';

interface ComposerProps {
  value: string;
  disabled?: boolean;
  isLoading?: boolean;
  mode: StudyMode;
  intent: StudyIntent;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const modeCopy: Record<StudyMode, string> = {
  companion: 'Study companion mode',
  tutor: 'Tutor mode',
};

const intentCopy: Record<StudyIntent, string> = {
  general: 'Ask, plan, practice, or get unstuck...',
  plan: 'Tell me what you need to study and how much time you have...',
  hint: 'Paste the problem or describe where you are stuck...',
  explain: 'What concept should I explain?',
  quiz: 'What topic should I quiz you on?',
  review: 'What should we review?',
  walkthrough: 'Paste the problem and where you got stuck...',
};

export function Composer({ value, disabled, isLoading, mode, intent, onChange, onSubmit }: ComposerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{modeCopy[mode]}</span>
        {intent !== 'general' && <span className="capitalize">{intent}</span>}
      </div>
      <div className="flex gap-4">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={intentCopy[intent]}
          className="min-h-[60px]"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <Button onClick={onSubmit} disabled={disabled || isLoading || !value.trim()} className="h-auto">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
