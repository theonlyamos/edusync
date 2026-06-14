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
                <Card key={chatId} className="group cursor-pointer hover:bg-accent" onClick={() => onLoadChat(chatId)}>
                  <CardContent className="relative p-3">
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(event) => event.stopPropagation()}>
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
                    <p className="truncate pr-8 text-sm font-medium">{chat.title}</p>
                    {lessonTitle && <p className="truncate text-xs text-muted-foreground">{lessonTitle}</p>}
                    <p className="text-xs text-muted-foreground">Updated: {new Date(chat.updatedAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              );
            })}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
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
