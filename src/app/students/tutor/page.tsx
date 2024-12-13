'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MessagesSquare, Send, Sparkles, History, BookOpen, Loader2, GraduationCap, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  lessonId?: string;
  followUpQuestions?: string[];
}

interface ChatHistory {
  _id: string;
  title: string;
  messages: Message[];
  userId: string;
  lessonId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
}

const suggestedQuestions = [
  "Can you explain the quadratic formula?",
  "How do I solve systems of equations?",
  "What are the key concepts in calculus?",
  "Help me understand probability theory",
];

export default function TutorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && session?.user?.role !== 'student')) {
      router.push('/login');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    // Fetch student's grade level
    const fetchGradeLevel = async () => {
      try {
        const response = await fetch('/api/students/profile');
        if (!response.ok) throw new Error('Failed to fetch profile');
        const data = await response.json();
        setGradeLevel(data.gradeLevel);
      } catch (error) {
        console.error('Error fetching grade level:', error);
        toast({
          title: 'Error',
          description: 'Failed to load your grade level. Some features may be limited.',
          variant: 'destructive',
        });
      }
    };

    // Fetch student's lessons
    const fetchLessons = async () => {
      try {
        const response = await fetch('/api/students/lessons');
        if (!response.ok) throw new Error('Failed to fetch lessons');
        const data = await response.json();
        setLessons(data);
      } catch (error) {
        console.error('Error fetching lessons:', error);
        toast({
          title: 'Error',
          description: 'Failed to load your lessons.',
          variant: 'destructive',
        });
      }
    };

    fetchGradeLevel();
    fetchLessons();
  }, [session, status, router, toast]);

  useEffect(() => {
    if (status === 'authenticated') {
      // Fetch chat history
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

      fetchChatHistory();
    }
  }, [status, toast]);

  const handleSend = async () => {
    if (!input.trim()) return;

    if (!gradeLevel) {
      toast({
        title: 'Error',
        description: 'Your grade level is not set. Please contact your teacher.',
        variant: 'destructive',
      });
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      lessonId: selectedLesson || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setSuggestedFollowUps([]); // Clear previous follow-up questions

    try {
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          lessonId: selectedLesson,
          chatId: currentChatId,
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Grade level not found. Please contact your teacher.');
        }
        throw new Error('Failed to get response from tutor');
      }

      const { message: tutorResponse, chatId } = await response.json();
      
      // Update current chat ID if this is a new chat
      if (chatId && !currentChatId) {
        setCurrentChatId(chatId);
      }

      const newMessage = { 
        ...tutorResponse, 
        lessonId: selectedLesson || undefined,
      };
      setMessages((prev) => [...prev, newMessage]);
      
      // Update suggested questions with follow-up questions if available
      if (tutorResponse.followUpQuestions?.length > 0) {
        setSuggestedFollowUps(tutorResponse.followUpQuestions);
      }

      // Refresh chat history
      const historyResponse = await fetch('/api/students/chats');
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        setChatHistory(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response from AI tutor',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = async (lessonId?: string) => {
    setSelectedLesson(lessonId || null);
    setCurrentChatId(null);
    
    const initialMessage = {
      role: 'assistant' as const,
      content: lessonId 
        ? `Hi! I'm your AI tutor for ${lessons.find(l => l._id === lessonId)?.title}. What would you like to learn about this lesson?`
        : "Hi! I'm your AI tutor. I'm here to help you understand any topic or solve any problem. What would you like to learn about today?",
      timestamp: new Date().toISOString(),
      lessonId: lessonId,
    };

    try {
      const response = await fetch('/api/students/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lessonId,
          messages: [initialMessage],
          title: lessonId 
            ? `Chat about ${lessons.find(l => l._id === lessonId)?.title}`
            : 'General Chat',
        }),
      });

      if (!response.ok) throw new Error('Failed to create new chat');
      
      const { chatId } = await response.json();
      setCurrentChatId(chatId);
      setMessages([initialMessage]);

      // Refresh chat history
      const historyResponse = await fetch('/api/students/chats');
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        setChatHistory(data);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to create new chat',
        variant: 'destructive',
      });
    }

    setShowNewChatDialog(false);
  };

  const loadChat = async (chatId: string) => {
    try {
      const response = await fetch(`/api/students/chats/${chatId}`);
      if (!response.ok) throw new Error('Failed to load chat');
      
      const chat = await response.json();
      setMessages(chat.messages);
      setSelectedLesson(chat.lessonId || null);
      setCurrentChatId(chat._id);
      setSuggestedFollowUps([]);
    } catch (error) {
      console.error('Error loading chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to load chat',
        variant: 'destructive',
      });
    }
  };

  const deleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent chat loading when clicking delete

    try {
      const response = await fetch(`/api/students/chats/${chatId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete chat');

      // Clear current chat if it's the one being deleted
      if (chatId === currentChatId) {
        setMessages([]);
        setCurrentChatId(null);
        setSelectedLesson(null);
        setSuggestedFollowUps([]);
      }

      // Refresh chat history
      const historyResponse = await fetch('/api/students/chats');
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        setChatHistory(data);
      }

      toast({
        title: 'Success',
        description: 'Chat deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete chat',
        variant: 'destructive',
      });
    }
  };

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="border-b p-4">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                {gradeLevel && (
                  <>
                    <GraduationCap className="h-4 w-4" />
                    <span>Grade Level: {gradeLevel}</span>
                  </>
                )}
                {selectedLesson && (
                  <>
                    <span className="mx-2">•</span>
                    <BookOpen className="h-4 w-4" />
                    <span>Lesson: {lessons.find(l => l._id === selectedLesson)?.title}</span>
                  </>
                )}
              </div>
              <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Chat
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start a New Chat</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select a Lesson (Optional)</label>
                      <Select
                        value={selectedLesson || ''}
                        onValueChange={(value) => startNewChat(value || undefined)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="General Chat (No specific lesson)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General Chat (No specific lesson)</SelectItem>
                          {lessons.map((lesson) => (
                            <SelectItem key={lesson._id} value={lesson._id}>
                              {lesson.title} - {lesson.subject}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={() => startNewChat()}
                    >
                      Start General Chat
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                    <div
                      className={`text-xs mt-2 ${
                        message.role === 'user'
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      <span>AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Suggested Questions */}
              <div className="space-y-2">
                {suggestedFollowUps.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Follow-up Questions:</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestedFollowUps.map((question, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setInput(question)}
                          disabled={!gradeLevel}
                          className="text-sm"
                        >
                          <Sparkles className="h-3 w-3 mr-2" />
                          {question}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.length === 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Suggested Topics:</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestedQuestions.map((question, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setInput(question)}
                          disabled={!gradeLevel}
                          className="text-sm"
                        >
                          <Sparkles className="h-3 w-3 mr-2" />
                          {question}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="min-h-[60px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim() || !gradeLevel}
                  className="h-auto"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {!gradeLevel && (
                <p className="text-sm text-destructive mt-2">
                  Your grade level is not set. Please contact your teacher to enable the AI tutor.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l bg-card">
          <div className="p-4">
            <h3 className="font-semibold mb-4">Your Lessons</h3>
            <Select
              value={selectedLesson || 'general'}
              onValueChange={(value) => startNewChat(value === 'general' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a lesson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Chat (No specific lesson)</SelectItem>
                {lessons.map((lesson) => (
                  <SelectItem key={lesson._id} value={lesson._id}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{lesson.title}</div>
                        <div className="text-xs text-muted-foreground">{lesson.subject}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t p-4">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setShowHistory(!showHistory)}
                disabled={!gradeLevel}
              >
                <History className="h-4 w-4 mr-2" />
                {showHistory ? 'Hide Chat History' : 'View Chat History'}
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setShowNewChatDialog(true)}
                disabled={!gradeLevel}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>
          </div>

          {showHistory && chatHistory.length > 0 && (
            <div className="border-t p-4">
              <h3 className="font-semibold mb-4">Recent Chats</h3>
              <div className="space-y-2">
                {chatHistory.map((chat) => (
                  <Card 
                    key={chat._id} 
                    className="cursor-pointer hover:bg-accent group"
                    onClick={() => loadChat(chat._id)}
                  >
                    <CardContent className="p-3 relative">
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Chat</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this chat? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={(e) => deleteChat(chat._id, e)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <p className="text-sm font-medium truncate pr-8">{chat.title}</p>
                      {chat.lessonId && (
                        <p className="text-xs text-muted-foreground truncate">
                          {lessons.find(l => l._id === chat.lessonId)?.title}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Updated: {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 