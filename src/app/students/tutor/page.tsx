'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MessagesSquare, Send, Sparkles, History, BookOpen, Loader2, GraduationCap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '@/components/ui/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI tutor. I'm here to help you understand any topic or solve any problem. What would you like to learn about today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ id: string; preview: string; timestamp: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user?.role !== 'student')) {
      router.push('/login');
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

    fetchGradeLevel();
  }, [session, status, router, toast]);

  useEffect(() => {
    // Load chat history from localStorage
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
      setChatHistory(JSON.parse(savedHistory));
    }
  }, []);

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
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Grade level not found. Please contact your teacher.');
        }
        throw new Error('Failed to get response from tutor');
      }

      const tutorResponse = await response.json();
      setMessages((prev) => [...prev, tutorResponse]);

      // Save to chat history
      const newChat = {
        id: new Date().toISOString(),
        preview: userMessage.content,
        timestamp: new Date().toISOString(),
      };
      const updatedHistory = [newChat, ...chatHistory].slice(0, 10); // Keep last 10 chats
      setChatHistory(updatedHistory);
      localStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
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

  const startNewChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Hi! I'm your AI tutor. I'm here to help you understand any topic or solve any problem. What would you like to learn about today?",
        timestamp: new Date().toISOString(),
      },
    ]);
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
          {gradeLevel && (
            <div className="border-b p-4">
              <div className="max-w-3xl mx-auto flex items-center gap-2 text-muted-foreground">
                <GraduationCap className="h-4 w-4" />
                <span>Grade Level: {gradeLevel}</span>
              </div>
            </div>
          )}

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
            <div className="max-w-3xl mx-auto">
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
            <h3 className="font-semibold mb-4">Suggested Questions</h3>
            <div className="space-y-2">
              {suggestedQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full justify-start text-left h-auto whitespace-normal"
                  onClick={() => setInput(question)}
                  disabled={!gradeLevel}
                >
                  <Sparkles className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>{question}</span>
                </Button>
              ))}
            </div>
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
                disabled={!gradeLevel}
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Browse Topics
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={startNewChat}
                disabled={!gradeLevel}
              >
                <MessagesSquare className="h-4 w-4 mr-2" />
                Start New Chat
              </Button>
            </div>
          </div>

          {showHistory && chatHistory.length > 0 && (
            <div className="border-t p-4">
              <h3 className="font-semibold mb-4">Recent Chats</h3>
              <div className="space-y-2">
                {chatHistory.map((chat) => (
                  <Card key={chat.id} className="cursor-pointer hover:bg-accent">
                    <CardContent className="p-3">
                      <p className="text-sm font-medium truncate">{chat.preview}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(chat.timestamp).toLocaleDateString()}
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