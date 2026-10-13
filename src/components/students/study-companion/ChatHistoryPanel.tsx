'use client';

import type { MouseEvent } from 'react';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ChatHistory, Lesson } from './types';
import { getChatId, getLessonId } from './types';

const SESSIONS_PAGE_SIZE = 5;

interface ChatHistoryPanelProps {
  chats: ChatHistory[];
  lessons: Lesson[];
  onLoadChat: (chatId: string) => void;
  onDeleteChat: (chatId: string, event: MouseEvent) => void;
}

export function ChatHistoryPanel({
  chats,
  lessons,
  onLoadChat,
  onDeleteChat,
}: ChatHistoryPanelProps) {
  const [visibleCount, setVisibleCount] = useState(SESSIONS_PAGE_SIZE);
  const visibleChats = chats.slice(0, visibleCount);
  const hasMore = chats.length > visibleCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t p-4">
      <h3 className="mb-4 shrink-0 font-semibold">Session History</h3>
      {chats.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {visibleChats.map((chat) => {
              const chatId = getChatId(chat);
              const lessonTitle = lessons.find((lesson) => getLessonId(lesson) === chat.lessonId)?.title;

              return (
                <Card key={chatId} className="group hover:bg-accent">
                  <CardContent className="relative p-0">
                    <div className="absolute right-2 top-2 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-11 w-11 p-0 xl:h-8 xl:w-8" aria-label={`Delete ${chat.title}`} onClick={(event) => event.stopPropagation()}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Study Session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this study session? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={(event) => event.stopPropagation()}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={(event) => onDeleteChat(chatId, event)} className="bg-destructive hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <button type="button" className="block w-full rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onLoadChat(chatId)}>
                      <span className="block truncate pr-12 text-sm font-medium xl:pr-8">{chat.title}</span>
                      {lessonTitle && <span className="block truncate pr-12 text-xs text-muted-foreground xl:pr-0">{lessonTitle}</span>}
                      <span className="block text-xs text-muted-foreground">Updated: {new Date(chat.updatedAt).toLocaleDateString()}</span>
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full text-muted-foreground xl:h-8"
              onClick={() => setVisibleCount((current) => current + SESSIONS_PAGE_SIZE)}
            >
              Show more
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No study sessions yet.</p>
      )}
    </div>
  );
}
