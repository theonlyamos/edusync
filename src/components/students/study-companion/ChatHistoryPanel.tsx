'use client';

import type { MouseEvent } from 'react';
import { History, Plus, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ChatHistory, Lesson } from './types';
import { getChatId, getLessonId } from './types';

interface ChatHistoryPanelProps {
  chats: ChatHistory[];
  lessons: Lesson[];
  showHistory: boolean;
  disabled?: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onLoadChat: (chatId: string) => void;
  onDeleteChat: (chatId: string, event: MouseEvent) => void;
}

export function ChatHistoryPanel({
  chats,
  lessons,
  showHistory,
  disabled,
  onToggleHistory,
  onNewChat,
  onLoadChat,
  onDeleteChat,
}: ChatHistoryPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Quick Actions</h3>
        <div className="mt-3 space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={onToggleHistory} disabled={disabled}>
            <History className="mr-2 h-4 w-4" />
            {showHistory ? 'Hide Chat History' : 'View Chat History'}
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={onNewChat} disabled={disabled}>
            <Plus className="mr-2 h-4 w-4" />
            New Study Session
          </Button>
        </div>
      </div>

      {showHistory && chats.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="mb-4 font-semibold">Recent Sessions</h3>
          <div className="space-y-2">
            {chats.map((chat) => {
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
          </div>
        </div>
      )}
    </div>
  );
}
