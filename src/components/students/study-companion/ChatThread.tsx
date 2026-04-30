'use client';

import { memo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StudyMessage, SuggestedAction } from './types';
import { InteractiveElementCard } from './InteractiveElementCard';

interface ChatThreadProps {
  messages: StudyMessage[];
  isLoading?: boolean;
  forceScrollKey?: number;
  onSuggestedAction: (action: SuggestedAction) => void;
}

const MessageBubble = memo(function MessageBubble({
  message,
  onSuggestedAction,
}: {
  message: StudyMessage;
  onSuggestedAction: (action: SuggestedAction) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg p-4 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        <div className="mb-2 flex flex-wrap gap-2">
          {message.mode && !isUser && <Badge variant="secondary">{message.mode === 'tutor' ? 'Tutor' : 'Companion'}</Badge>}
          {message.intent && message.intent !== 'general' && !isUser && <Badge variant="outline">{message.intent}</Badge>}
        </div>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        {!isUser && message.interactiveElements?.length ? (
          <div className="mt-4 space-y-4">
            {message.interactiveElements.map((el) => (
              <InteractiveElementCard key={el.id} element={el} />
            ))}
          </div>
        ) : null}
        {(message.followUpQuestions?.length || message.suggestedActions?.length) && !isUser ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.suggestedActions?.map((action) => (
              <Button
                key={`${action.intent}-${action.label}`}
                variant="outline"
                size="sm"
                className="bg-background text-foreground"
                onClick={() => onSuggestedAction(action)}
              >
                <Sparkles className="mr-2 h-3 w-3" />
                {action.label}
              </Button>
            ))}
            {message.followUpQuestions?.map((question) => (
              <Button
                key={question}
                variant="outline"
                size="sm"
                className="bg-background text-foreground"
                onClick={() => onSuggestedAction({ label: question, intent: 'general', prompt: question })}
              >
                {question}
              </Button>
            ))}
          </div>
        ) : null}
        <div className={`mt-2 text-xs ${isUser ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
});

export function ChatThread({ messages, isLoading, forceScrollKey, onSuggestedAction }: ChatThreadProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const scrollContainer = threadRef.current?.parentElement;
    if (!scrollContainer) return;

    const updateNearBottom = () => {
      const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 80;
    };

    updateNearBottom();
    scrollContainer.addEventListener('scroll', updateNearBottom, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', updateNearBottom);
    };
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, isLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    isNearBottomRef.current = true;
  }, [forceScrollKey]);

  return (
    <div ref={threadRef} className="mx-auto max-w-3xl space-y-6">
      {messages.map((message, index) => (
        <MessageBubble key={`${message.timestamp}-${index}`} message={message} onSuggestedAction={onSuggestedAction} />
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span>Study companion is thinking...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
