'use client';

import type { MouseEvent } from 'react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GraduationCap, Loader2, Plus, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { ChatThread } from './ChatThread';
import { Composer } from './Composer';
import { LessonContextPanel } from './LessonContextPanel';
import { QuickActions } from './QuickActions';
import { quickActions, type QuickAction } from './study-actions';
import type { ChatHistory, Lesson, StudyIntent, StudyMessage, StudyMode, SuggestedAction } from './types';
import { getChatId, getLessonId } from './types';

const starterPrompts = [
  'Help me make a study plan for today.',
  'Quiz me on my current lesson.',
  'Give me a hint without solving the whole problem.',
  'Explain a topic step by step.',
];

type OutageNotice = {
  content: string;
  mode: StudyMode;
  intent: StudyIntent;
  errorCode?: string;
};

const getInitialMessage = (lessonTitle?: string, lessonId?: string): StudyMessage => ({
  role: 'assistant',
  content: lessonTitle
    ? `Hi, I'm your study companion for **${lessonTitle}**. We can plan, review, quiz, or switch into tutor mode when you need a walkthrough. What should we work on first?`
    : "Hi, I'm your study companion. I can help you plan, practice, review, or get unstuck without taking over your learning. What are we studying today?",
  timestamp: new Date().toISOString(),
  lessonId,
  mode: 'companion',
  intent: 'general',
  suggestedActions: [
    { label: 'Plan my session', intent: 'plan', prompt: 'Help me make a focused study plan for this session.' },
    { label: 'Quiz me', intent: 'quiz', prompt: 'Quiz me one question at a time.' },
    { label: 'Give me a hint', intent: 'hint', prompt: 'Give me a small hint without the full answer.' },
  ],
});

export function StudyCompanionShell() {
  const session = useContext(SupabaseSessionContext);
  const { toast } = useToast();
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [mode, setMode] = useState<StudyMode>('companion');
  const [intent, setIntent] = useState<StudyIntent>('general');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [outageNotice, setOutageNotice] = useState<OutageNotice | null>(null);
  const [localSendCount, setLocalSendCount] = useState(0);

  const selectedLessonTitle = useMemo(
    () => lessons.find((lesson) => getLessonId(lesson) === selectedLesson)?.title,
    [lessons, selectedLesson],
  );

  useEffect(() => {
    const fetchStudentContext = async () => {
      const [profileResult, lessonsResult] = await Promise.allSettled([
        fetch('/api/students/profile'),
        fetch('/api/students/lessons'),
      ]);

      if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
        const profile = await profileResult.value.json();
        setGradeLevel(profile.gradeLevel);
      } else {
        console.warn('Study companion loaded without a student grade level.');
      }

      if (lessonsResult.status === 'fulfilled' && lessonsResult.value.ok) {
        const studentLessons = await lessonsResult.value.json();
        setLessons(studentLessons);
      } else {
        console.warn('Study companion loaded without lesson context.');
        toast({
          title: 'Limited study context',
          description: 'Lesson-specific help is unavailable, but general study companion features still work.',
        });
      }
    };

    if (session?.user?.role === 'student') {
      fetchStudentContext();
    }
  }, [session, toast]);

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const response = await fetch('/api/students/chats');
        if (!response.ok) throw new Error('Failed to fetch chat history');
        const data = await response.json();
        setChatHistory(data);
      } catch (error) {
        console.error('Error fetching chat history:', error);
        toast({
          title: 'Error',
          description: 'Failed to load chat history',
          variant: 'destructive',
        });
      }
    };

    if (session?.user?.role === 'student') {
      fetchChatHistory();
    }
  }, [session, toast]);

  const updateHistoryTimestamp = (chatId: string, title?: string, lessonId?: string) => {
    setChatHistory((current) => {
      const now = new Date().toISOString();
      const existing = current.find((chat) => getChatId(chat) === chatId);

      if (!existing && title) {
        return [
          {
            id: chatId,
            title,
            messages: [],
            userId: session?.user?.id ?? '',
            lessonId,
            createdAt: now,
            updatedAt: now,
          },
          ...current,
        ];
      }

      return current
        .map((chat) => (getChatId(chat) === chatId ? { ...chat, updatedAt: now } : chat))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  };

  const refreshChatHistory = async () => {
    try {
      const response = await fetch('/api/students/chats');
      if (!response.ok) return;
      const data = await response.json();
      setChatHistory(data);
    } catch (error) {
      console.warn('Unable to refresh study session history:', error);
    }
  };

  const startNewChat = async (lessonId?: string) => {
    const lesson = lessons.find((item) => getLessonId(item) === lessonId);
    const initialMessage = getInitialMessage(lesson?.title, lessonId);
    const title = lesson ? `Study session: ${lesson.title}` : 'General study session';

    setSelectedLesson(lessonId || null);
    setCurrentChatId(null);
    setMode('companion');
    setIntent('general');
    setOutageNotice(null);

    try {
      const response = await fetch('/api/students/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          messages: [initialMessage],
          title,
        }),
      });

      if (!response.ok) throw new Error('Failed to create study session');

      const { chatId } = await response.json();
      setCurrentChatId(chatId);
      setMessages([initialMessage]);
      updateHistoryTimestamp(chatId, title, lessonId);
    } catch (error) {
      console.error('Error creating study session:', error);
      toast({
        title: 'Error',
        description: 'Failed to create a new study session',
        variant: 'destructive',
      });
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const response = await fetch(`/api/students/chats/${chatId}`);
      if (!response.ok) throw new Error('Failed to load study session');

      const chat = await response.json();
      const loadedMessages = chat.messages ?? [];
      const lastAssistant = [...loadedMessages].reverse().find((message: StudyMessage) => message.role === 'assistant');

      setMessages(loadedMessages);
      setSelectedLesson(chat.lessonId || null);
      setCurrentChatId(chat._id ?? chat.id ?? null);
      setMode(lastAssistant?.mode ?? 'companion');
      setIntent(lastAssistant?.intent ?? 'general');
      setOutageNotice(null);
    } catch (error) {
      console.error('Error loading study session:', error);
      toast({
        title: 'Error',
        description: 'Failed to load study session',
        variant: 'destructive',
      });
    }
  };

  const deleteChat = async (chatId: string, event: MouseEvent) => {
    event.stopPropagation();

    try {
      const response = await fetch(`/api/students/chats/${chatId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete study session');

      if (chatId === currentChatId) {
        setMessages([]);
        setCurrentChatId(null);
        setSelectedLesson(null);
        setMode('companion');
        setIntent('general');
        setOutageNotice(null);
      }

      setChatHistory((current) => current.filter((chat) => getChatId(chat) !== chatId));
      toast({ title: 'Success', description: 'Study session deleted successfully' });
    } catch (error) {
      console.error('Error deleting study session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete study session',
        variant: 'destructive',
      });
    }
  };

  const selectAction = (action: QuickAction | SuggestedAction) => {
    const nextMode = 'mode' in action ? action.mode : action.intent === 'explain' || action.intent === 'walkthrough' ? 'tutor' : 'companion';
    setMode(nextMode);
    setIntent(action.intent);
    setInput(action.prompt);
    setOutageNotice(null);
  };

  const sendMessage = async (options?: { retryContent?: string; retryMode?: StudyMode; retryIntent?: StudyIntent }) => {
    const messageContent = (options?.retryContent ?? input).trim();
    if (!messageContent) return;

    const requestMode = options?.retryMode ?? mode;
    const requestIntent = options?.retryIntent ?? intent;
    const isRetry = Boolean(options?.retryContent);

    const userMessage: StudyMessage = {
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      lessonId: selectedLesson || undefined,
      mode: requestMode,
      intent: requestIntent,
    };
    const previousMessages = messages;
    const nextMessages = isRetry ? messages : [...messages, userMessage];

    setMessages(nextMessages);
    setLocalSendCount((current) => current + 1);
    if (!isRetry) setInput('');
    setOutageNotice(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent,
          lessonId: selectedLesson,
          chatId: currentChatId,
          mode: requestMode,
          intent: requestIntent,
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Grade level not found. Please contact your teacher.');
        }
        throw new Error('Failed to get a response from your study companion');
      }

      const { message: companionResponse, chatId, aiStatus, errorCode } = await response.json();

      if (chatId && !currentChatId) {
        setCurrentChatId(chatId);
        updateHistoryTimestamp(chatId, userMessage.content.slice(0, 50) || 'Study session', selectedLesson || undefined);
      } else if (chatId) {
        updateHistoryTimestamp(chatId);
      }

      if (aiStatus === 'unavailable') {
        setOutageNotice({
          content: messageContent,
          mode: requestMode,
          intent: requestIntent,
          errorCode,
        });
        refreshChatHistory();
        return;
      }

      if (!companionResponse) {
        throw new Error('Failed to get a response from your study companion');
      }

      const assistantMessage: StudyMessage = {
        ...companionResponse,
        lessonId: selectedLesson || undefined,
        mode: companionResponse.mode ?? requestMode,
        intent: companionResponse.intent ?? requestIntent,
      };

      setMessages((current) => [...current, assistantMessage]);
      setMode(assistantMessage.mode ?? 'companion');
      setIntent('general');
      refreshChatHistory();
    } catch (error) {
      console.error('Error:', error);
      if (!isRetry) setMessages(previousMessages);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get a response from your study companion',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b p-4">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-semibold">Study Companion</h1>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {gradeLevel && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-4 w-4" />
                      Grade {gradeLevel}
                    </span>
                  )}
                  {selectedLessonTitle && (
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      {selectedLessonTitle}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => startNewChat()} disabled={isLoading}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Session
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                  aria-label={isContextPanelOpen ? 'Hide study context panel' : 'Show study context panel'}
                  title={isContextPanelOpen ? 'Hide study context' : 'Show study context'}
                  onClick={() => setIsContextPanelOpen((current) => !current)}
                >
                  {isContextPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {messages.length > 0 ? (
              <ChatThread
                messages={messages}
                isLoading={isLoading}
                forceScrollKey={localSendCount}
                onSuggestedAction={selectAction}
              />
            ) : (
              <div className="mx-auto grid max-w-3xl gap-6">
                <Card>
                  <CardContent className="space-y-4 p-6">
                    <div>
                      <h2 className="text-xl font-semibold">What are we studying today?</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Start with a plan, quiz yourself, ask for a hint, or switch into tutor mode when you need a deeper explanation.
                      </p>
                    </div>
                    <QuickActions actions={quickActions} disabled={isLoading} onAction={selectAction} />
                    <div className="flex flex-wrap gap-2">
                      {starterPrompts.map((prompt) => (
                        <Button key={prompt} variant="secondary" size="sm" onClick={() => setInput(prompt)} disabled={isLoading}>
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <div className="border-t p-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Quick actions</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                      onClick={() => setShowQuickActions((current) => !current)}
                    >
                      {showQuickActions ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Show
                        </>
                      )}
                    </Button>
                  </div>
                  {showQuickActions && <QuickActions actions={quickActions} disabled={isLoading} onAction={selectAction} />}
                </div>
              )}
              {outageNotice && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">The AI service is temporarily unavailable.</p>
                        <p className="text-amber-900/80 dark:text-amber-100/80">
                          Your message was saved. Retry when the service is back, or keep preparing with quick actions.
                          {outageNotice.errorCode ? ` (${outageNotice.errorCode})` : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 bg-background"
                      onClick={() =>
                        sendMessage({
                          retryContent: outageNotice.content,
                          retryMode: outageNotice.mode,
                          retryIntent: outageNotice.intent,
                        })
                      }
                      disabled={isLoading}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}
              <Composer
                value={input}
                disabled={false}
                isLoading={isLoading}
                mode={mode}
                intent={intent}
                onChange={setInput}
                onSubmit={sendMessage}
              />
              {!gradeLevel && (
                <p className="text-sm text-muted-foreground">
                  Grade level is not set, so responses will use general student-friendly guidance.
                </p>
              )}
            </div>
          </div>
        </main>

        <aside
          aria-hidden={!isContextPanelOpen}
          className={`shrink-0 overflow-hidden border-l bg-card transition-all duration-300 ease-in-out ${
            isContextPanelOpen ? 'w-80 opacity-100' : 'w-0 border-l-0 opacity-0'
          }`}
        >
          {isContextPanelOpen && (
            <div className="h-full w-80 overflow-y-auto p-4">
              <LessonContextPanel
                gradeLevel={gradeLevel}
                lessons={lessons}
                selectedLesson={selectedLesson}
                disabled={isLoading}
                onLessonChange={startNewChat}
              />
              <div className="mt-6 border-t pt-4">
                <ChatHistoryPanel
                  chats={chatHistory}
                  lessons={lessons}
                  showHistory={showHistory}
                  disabled={false}
                  onToggleHistory={() => setShowHistory((current) => !current)}
                  onNewChat={() => startNewChat()}
                  onLoadChat={loadChat}
                  onDeleteChat={deleteChat}
                />
              </div>
            </div>
          )}
        </aside>
      </div>
    </DashboardLayout>
  );
}
