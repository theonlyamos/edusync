'use client';

import type { MouseEvent } from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import type { LessonContext } from '@/hooks/useAudioStreaming';
import { requestVisualizationFromGenAi } from '@/lib/request-visualization';
import {
  MAX_EXPLANATION_LENGTH,
  MAX_INTERACTIVE_CODE_LENGTH,
  MAX_STORED_MESSAGES,
  buildVisualizationTaskDescription,
} from '@/lib/study-companion';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { ChatThread } from './ChatThread';
import { Composer } from './Composer';
import { LessonContextPanel } from './LessonContextPanel';
import { QuickActions } from './QuickActions';
import { quickActions, type QuickAction } from './study-actions';
import type { ChatHistory, InteractiveElement, InteractiveElementUpdate, Lesson, StudyIntent, StudyMessage, StudyMode, SuggestedAction, VoiceInteractiveGenEvent } from './types';
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
  const [gradeLevel, setGradeLevel] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [learningRunId, setLearningRunId] = useState<string | null>(null);
  const [learningObjectives, setLearningObjectives] = useState<Array<{ id: string; text: string; position: number }>>([]);
  const [activeObjectiveId, setActiveObjectiveId] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [mode, setMode] = useState<StudyMode>('companion');
  const [intent, setIntent] = useState<StudyIntent>('general');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [outageNotice, setOutageNotice] = useState<OutageNotice | null>(null);
  const [localSendCount, setLocalSendCount] = useState(0);
  const chatIdRef = useRef<string | null>(null);
  const messagesRef = useRef<StudyMessage[]>([]);
  const voicePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPanelButtonRef = useRef<HTMLButtonElement>(null);
  const closePanelButtonRef = useRef<HTMLButtonElement>(null);
  const contextPanelToggledRef = useRef(false);

  useEffect(() => {
    chatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep keyboard focus with the toggle: after the panel opens/closes, move focus to whichever
  // control replaced the one the user just activated (it unmounts on toggle). Skip the initial mount.
  useEffect(() => {
    if (!contextPanelToggledRef.current) {
      contextPanelToggledRef.current = true;
      return;
    }
    if (isContextPanelOpen) {
      closePanelButtonRef.current?.focus();
    } else {
      openPanelButtonRef.current?.focus();
    }
  }, [isContextPanelOpen]);

  useEffect(() => {
    return () => {
      if (voicePersistTimerRef.current) {
        clearTimeout(voicePersistTimerRef.current);
      }
    };
  }, []);

  const lessonVoiceContext = useMemo((): LessonContext | undefined => {
    if (!selectedLesson) return undefined;
    const lesson = lessons.find((item) => getLessonId(item) === selectedLesson);
    if (!lesson) return undefined;
    return {
      lessonId: selectedLesson,
      title: lesson.title,
      subject: lesson.subject,
      gradeLevel: lesson.gradeLevel ?? lesson.gradelevel ?? gradeLevel ?? undefined,
      objectives: lesson.objectives ?? undefined,
      content: lesson.content ?? undefined,
    };
  }, [selectedLesson, lessons, gradeLevel]);

  const voiceLiveOptions = useMemo(
    () => ({
      variant: 'studyCompanion' as const,
      gradeLevel,
      studyMode: mode,
      studyIntent: intent,
    }),
    [gradeLevel, mode, intent],
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

    if (session?.user) {
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

    if (session?.user) {
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

  const refreshChatHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/students/chats');
      if (!response.ok) return;
      const data = await response.json();
      setChatHistory(data);
    } catch (error) {
      console.warn('Unable to refresh study session history:', error);
    }
  }, []);

  const persistChatMessages = useCallback(
    (msgs: StudyMessage[]) => {
      const id = chatIdRef.current;
      if (!id) return;
      // The server stores only the last MAX_STORED_MESSAGES and the update schema rejects more, so
      // send that same window to avoid a 400 and keep client/server in sync.
      const trimmed = msgs.length > MAX_STORED_MESSAGES ? msgs.slice(-MAX_STORED_MESSAGES) : msgs;
      void fetch(`/api/students/chats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: trimmed }),
      })
        .then((response) => {
          if (response.ok) void refreshChatHistory();
        })
        .catch(() => {});
    },
    [refreshChatHistory],
  );

  // Regenerate a visualization in place. The shell owns this (not the card) because it has the
  // grade/lesson context to rebuild the same grounded prompt the original used. The state merge uses
  // a functional update + persists the merged result, so a concurrent message append can't clobber
  // it and the saved copy always matches what's shown.
  const handleRegenerateElement = useCallback(
    async (element: InteractiveElement): Promise<InteractiveElementUpdate> => {
      const msgs = messagesRef.current;
      const hostIndex = msgs.findIndex((message) =>
        message.interactiveElements?.some((el) => el.id === element.id),
      );
      const hostLessonId =
        (hostIndex >= 0 ? msgs[hostIndex]?.lessonId : undefined) ?? selectedLesson ?? undefined;
      const lesson = hostLessonId ? lessons.find((item) => getLessonId(item) === hostLessonId) : undefined;
      let latestUserContent = '';
      for (let i = hostIndex - 1; i >= 0; i--) {
        if (msgs[i]?.role === 'user') {
          latestUserContent = msgs[i].content;
          break;
        }
      }

      const taskDescription = buildVisualizationTaskDescription({
        request: { kind: 'visualization', taskDescription: element.taskDescription },
        gradeLevel: gradeLevel ?? "the student's current level",
        lesson: lesson
          ? {
              id: hostLessonId as string,
              title: lesson.title,
              subject: lesson.subject,
              objectives: lesson.objectives ?? null,
              gradelevel: lesson.gradeLevel ?? lesson.gradelevel ?? null,
            }
          : undefined,
        latestUserContent,
      });

      const result = await requestVisualizationFromGenAi({ taskDescription });
      const update: InteractiveElementUpdate = {
        code: result.code.slice(0, MAX_INTERACTIVE_CODE_LENGTH),
        library: result.library,
        explanation: result.explanation
          ? result.explanation.trim().slice(0, MAX_EXPLANATION_LENGTH)
          : undefined,
      };

      setMessages((current) => {
        const next = current.map((message) =>
          message.interactiveElements?.some((el) => el.id === element.id)
            ? {
                ...message,
                interactiveElements: message.interactiveElements.map((el) =>
                  el.id === element.id ? { ...el, ...update } : el,
                ),
              }
            : message,
        );
        persistChatMessages(next);
        return next;
      });

      return update;
    },
    [gradeLevel, lessons, selectedLesson, persistChatMessages],
  );

  const scheduleVoiceChatPersist = () => {
    if (!chatIdRef.current) return;

    if (voicePersistTimerRef.current) clearTimeout(voicePersistTimerRef.current);
    voicePersistTimerRef.current = setTimeout(() => {
      voicePersistTimerRef.current = null;
      persistChatMessages(messagesRef.current);
    }, 200);
  };

  const startNewChat = async (lessonId?: string): Promise<string | null> => {
    const lesson = lessons.find((item) => getLessonId(item) === lessonId);
    const initialMessage = getInitialMessage(lesson?.title, lessonId);
    const title = lesson ? `Study session: ${lesson.title}` : 'General study session';

    setSelectedLesson(lessonId || null);
    setLearningRunId(null);
    setLearningObjectives([]);
    setActiveObjectiveId(null);
    setCurrentChatId(null);
    chatIdRef.current = null;
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
      chatIdRef.current = chatId;
      setCurrentChatId(chatId);
      setMessages([initialMessage]);
      updateHistoryTimestamp(chatId, title, lessonId);
      if (lessonId) {
        const runResponse = await fetch('/api/learning-runs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, mode: 'tutor' }),
        });
        if (runResponse.ok) {
          const runData = await runResponse.json();
          setLearningRunId(runData.run.id);
          setLearningObjectives(runData.objectives);
          setActiveObjectiveId(runData.run.active_objective_id);
        }
      }
      return chatId;
    } catch (error) {
      console.error('Error creating study session:', error);
      toast({
        title: 'Error',
        description: 'Failed to create a new study session',
        variant: 'destructive',
      });
      return null;
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
      setLearningRunId(null);
      setLearningObjectives([]);
      setActiveObjectiveId(null);
      const loadedChatId = chat._id ?? chat.id ?? null;
      chatIdRef.current = loadedChatId;
      setCurrentChatId(loadedChatId);
      setMode(lastAssistant?.mode ?? 'companion');
      setIntent(lastAssistant?.intent ?? 'general');
      setOutageNotice(null);
      if (chat.lessonId) {
        const runResponse = await fetch('/api/learning-runs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId: chat.lessonId, mode: 'tutor' }),
        });
        if (runResponse.ok) {
          const runData = await runResponse.json();
          setLearningRunId(runData.run.id);
          setLearningObjectives(runData.objectives);
          setActiveObjectiveId(runData.run.active_objective_id);
        }
      }
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
        chatIdRef.current = null;
        setSelectedLesson(null);
        setLearningRunId(null);
        setLearningObjectives([]);
        setActiveObjectiveId(null);
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

  const selectAction = useCallback((action: QuickAction | SuggestedAction) => {
    const nextMode = 'mode' in action ? action.mode : action.intent === 'explain' || action.intent === 'walkthrough' ? 'tutor' : 'companion';
    setMode(nextMode);
    setIntent(action.intent);
    setInput(action.prompt);
    setOutageNotice(null);
  }, []);

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
          learningRunId,
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Grade level not found. Please contact your teacher.');
        }
        throw new Error('Failed to get a response from your study companion');
      }

      const { message: companionResponse, chatId, aiStatus, errorCode, visualizationStatus } = await response.json();

      if (chatId && !currentChatId) {
        chatIdRef.current = chatId;
        setCurrentChatId(chatId);
        updateHistoryTimestamp(chatId, userMessage.content.slice(0, 50) || 'Study session', selectedLesson || undefined);
      } else if (chatId) {
        updateHistoryTimestamp(chatId);
      }

      if (visualizationStatus === 'failed') {
        toast({
          title: 'Interactive visual unavailable',
          description: 'You still have the text answer below; we could not generate the interactive piece.',
        });
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

  const handleVoiceTranscript = (msg: StudyMessage) => {
    setMessages((prev) => [...prev, msg]);
    setLocalSendCount((current) => current + 1);

    scheduleVoiceChatPersist();
  };

  const handleVoiceInteractiveGen = (event: VoiceInteractiveGenEvent) => {
    if (event.type === 'placeholder') {
      setMessages((prev) => [...prev, event.message]);
      setLocalSendCount((current) => current + 1);
      scheduleVoiceChatPersist();
      return;
    }
    if (event.type === 'success') {
      setMessages((prev) =>
        prev.map((m) => (m.voiceVizPlaceholderId === event.replaceId ? event.message : m)),
      );
      scheduleVoiceChatPersist();
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.voiceVizPlaceholderId === event.replaceId
          ? {
              ...m,
              content:
                'Could not generate the interactive visual. Your voice session is still active — try asking again or use text chat.',
              voiceVizPlaceholderId: undefined,
            }
          : m,
      ),
    );
    toast({
      title: 'Interactive visual unavailable',
      description:
        event.description ?? 'Generation failed. You can keep using voice or ask again in text.',
      variant: 'destructive',
    });
    scheduleVoiceChatPersist();
  };

  if (!session) {
    return (
      <DashboardLayout fullBleed>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout fullBleed>
      <div className="relative flex h-[100vh]">
        {/* Hanging open button: floats over the top-right of the page when the context panel is
            closed, so it never shifts the chat layout. */}
        {!isContextPanelOpen && (
          <Button
            ref={openPanelButtonRef}
            variant="outline"
            size="sm"
            className="absolute right-4 top-4 z-20 h-9 w-9 p-0 shadow-md"
            aria-label="Show study context panel"
            title="Show study context"
            onClick={() => setIsContextPanelOpen(true)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length > 0 ? (
              <ChatThread
                messages={messages}
                isLoading={isLoading}
                forceScrollKey={localSendCount}
                onSuggestedAction={selectAction}
                onRegenerate={handleRegenerateElement}
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
                gradeLevel={gradeLevel}
                selectedLessonId={selectedLesson}
                lessonVoiceContext={lessonVoiceContext}
                voiceLiveOptions={voiceLiveOptions}
                voiceSessionReady={Boolean(currentChatId)}
                quickActionsToggle={
                  messages.length > 0
                    ? { expanded: showQuickActions, onToggle: () => setShowQuickActions((c) => !c) }
                    : undefined
                }
                quickActions={
                  messages.length > 0 ? (
                    <QuickActions actions={quickActions} disabled={isLoading} onAction={selectAction} />
                  ) : undefined
                }
                ensureChatForVoice={async () => {
                  if (chatIdRef.current) return true;
                  const id = await startNewChat(selectedLesson ?? undefined);
                  return Boolean(id);
                }}
                onChange={setInput}
                onSubmit={sendMessage}
                onVoiceTranscript={handleVoiceTranscript}
                onVoiceInteractiveGen={handleVoiceInteractiveGen}
                onVoiceError={(description) =>
                  toast({
                    title: 'Voice',
                    description,
                    variant: 'destructive',
                  })
                }
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
            <div className="flex h-full w-80 flex-col">
              <div className="flex items-center justify-between gap-2 border-b p-2">
                <Button
                  ref={closePanelButtonRef}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="Hide study context panel"
                  title="Hide study context"
                  onClick={() => setIsContextPanelOpen(false)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startNewChat()}
                  disabled={isLoading}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Study Session
                </Button>
              </div>
              <div className="shrink-0 p-4">
                <LessonContextPanel
                  gradeLevel={gradeLevel}
                  lessons={lessons}
                  selectedLesson={selectedLesson}
                  disabled={isLoading}
                  onLessonChange={startNewChat}
                  objectives={learningObjectives}
                  selectedObjectiveId={activeObjectiveId}
                  onObjectiveChange={async (objectiveId) => {
                    if (!learningRunId) return;
                    const response = await fetch(`/api/learning-runs/${learningRunId}/objective`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectiveId }),
                    });
                    if (response.ok) setActiveObjectiveId(objectiveId);
                  }}
                />
              </div>
              <ChatHistoryPanel
                chats={chatHistory}
                lessons={lessons}
                onLoadChat={loadChat}
                onDeleteChat={deleteChat}
              />
            </div>
          )}
        </aside>
      </div>
    </DashboardLayout>
  );
}
