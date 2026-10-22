'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Brain, Calculator, FileText, Lightbulb, Target, Loader2 } from 'lucide-react';
import { PracticeExercise } from '@/components/practice/PracticeExercise';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface PracticeLesson {
  id: string;
  title: string;
  subject: string;
  objectives: string[];
}

const OTHER_TOPIC = '__other__';

const practiceCategories = [
  {
    title: 'Quick Practice',
    description: 'Short exercises on your most recent lesson',
    icon: Target,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    type: 'quick',
    difficulty: 'adaptive',
  },
  {
    title: 'Problem Solving',
    description: 'Complex problems that test your understanding',
    icon: Brain,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/40',
    type: 'problem_solving',
    difficulty: 'hard',
  },
  {
    title: 'Skill Assessment',
    description: 'Test your knowledge in specific areas',
    icon: Calculator,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/40',
    type: 'assessment',
    difficulty: 'medium',
  },
  {
    title: 'Challenge Mode',
    description: 'Advanced problems for extra practice',
    icon: Lightbulb,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    type: 'challenge',
    difficulty: 'expert',
  },
];

export default function PracticePage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [lessons, setLessons] = useState<PracticeLesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [lessonChoice, setLessonChoice] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [practicing, setPracticing] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState({
    averageScore: 0,
    exercisesCompleted: 0,
    streak: 0,
    recentScores: [] as number[],
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
    fetchLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLessons = async () => {
    try {
      const response = await fetch('/api/students/lessons');
      if (!response.ok) throw new Error('Failed to fetch lessons');
      const data: PracticeLesson[] = await response.json();
      setLessons(Array.isArray(data) ? data : []);
    } catch (error) {
      // Practice still works with a typed topic.
      console.error('Error fetching lessons for practice:', error);
    } finally {
      setLessonsLoaded(true);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/students/practice/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats({
        averageScore: data.averageScore || 0,
        exercisesCompleted: data.totalExercisesCompleted || 0,
        streak: data.currentStreak || 0,
        recentScores: Array.isArray(data.recentScores) ? data.recentScores : [],
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load practice statistics',
        variant: 'destructive',
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    // Start on the most recent lesson; the student can change it.
    if (!lessonChoice) setLessonChoice(lessons[0]?.id ?? OTHER_TOPIC);
    setShowSetup(true);
  };

  const chosenLesson = lessons.find((lesson) => lesson.id === lessonChoice) ?? null;

  const handleStartPractice = async () => {
    const useLesson = chosenLesson !== null;
    if (!useLesson && (!subject.trim() || !topic.trim())) {
      toast({
        title: 'Missing information',
        description: 'Pick one of your lessons, or type a subject and topic.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const category = practiceCategories.find(c => c.type === selectedCategory);
      const response = await fetch('/api/students/practice/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(useLesson ? { lessonId: chosenLesson.id } : { subject: subject.trim(), topic: topic.trim() }),
          difficulty: category?.difficulty || 'medium',
          type: selectedCategory,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || 'Failed to generate exercises. Please try again.');

      if (useLesson) {
        setSubject(chosenLesson.subject);
        setTopic(chosenLesson.title);
      }
      setQuestions(data.questions);
      setShowSetup(false);
      setPracticing(true);
    } catch (error) {
      console.error('Error generating exercises:', error);
      toast({
        title: 'Could not start practice',
        description: error instanceof Error ? error.message : 'Failed to generate exercises. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Keep the results on screen; only refresh the stats behind them.
  const handlePracticeComplete = async () => {
    await fetchStats();
  };

  const handleBackToPractice = () => {
    setPracticing(false);
    setSelectedCategory(null);
    setQuestions([]);
  };

  if (practicing) {
    return (
      <DashboardLayout>
        <div className="p-3 sm:p-6 max-w-4xl mx-auto">
          <Button variant="outline" onClick={handleBackToPractice} className="mb-4 min-h-11 xl:min-h-0">
            Back to practice
          </Button>
          <PracticeExercise
            key={attemptKey}
            subject={subject}
            topic={topic}
            questions={questions}
            onComplete={handlePracticeComplete}
            onRetry={() => setAttemptKey((key) => key + 1)}
            onGenerateNew={handleBackToPractice}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Practice</h1>
          <p className="text-muted-foreground">
            Pick a style, then a lesson to practise
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {practiceCategories.map((category) => (
            <Card
              key={category.title}
              className="cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              onClick={() => handleCategorySelect(category.type)}
            >
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className={`shrink-0 p-3 rounded-xl ${category.bgColor}`}>
                    <category.icon className={`h-6 w-6 ${category.color}`} />
                  </div>
                  <div className="min-w-0 break-words">
                    <CardTitle>{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span>Difficulty: {category.difficulty}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Progress Section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Your progress</h2>
          <Card>
            <CardContent className="pt-6">
              {loadingStats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      {stats.averageScore}%
                    </div>
                    <p className="text-sm text-muted-foreground">Average score</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-foreground mb-2">
                      {stats.exercisesCompleted}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Exercises completed
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-foreground mb-2">
                      {stats.streak}
                    </div>
                    <p className="text-sm text-muted-foreground">Day streak</p>
                  </div>
                  {stats.recentScores.length > 0 && (
                    <div className="md:col-span-3">
                      <p className="mb-2 text-sm font-medium">Recent scores</p>
                      <div className="flex flex-wrap gap-2">
                        {stats.recentScores.slice(-10).reverse().map((score, index) => (
                          <span
                            key={index}
                            className="rounded-md border px-2 py-1 text-sm tabular-nums"
                          >
                            {Math.round(score)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Setup Dialog */}
        <Dialog open={showSetup} onOpenChange={setShowSetup}>
          <DialogContent className="w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Set up practice</DialogTitle>
              <DialogDescription>
                Questions are built from the lesson you pick.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="practice-lesson">Lesson</Label>
                <Select value={lessonChoice} onValueChange={setLessonChoice} disabled={!lessonsLoaded}>
                  <SelectTrigger id="practice-lesson" className="min-h-11">
                    <SelectValue placeholder={lessonsLoaded ? 'Choose a lesson' : 'Loading your lessons…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson.id} value={lesson.id}>
                        {lesson.title} · {lesson.subject}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_TOPIC}>Something else…</SelectItem>
                  </SelectContent>
                </Select>
                {chosenLesson && chosenLesson.objectives.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Covers {chosenLesson.objectives.length} objective{chosenLesson.objectives.length === 1 ? '' : 's'} from this lesson.
                  </p>
                )}
              </div>

              {!chosenLesson && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="practice-subject">Subject</Label>
                    <Input
                      id="practice-subject"
                      className="min-h-11"
                      placeholder="e.g. Mathematics"
                      value={subject}
                      maxLength={60}
                      onChange={(event) => setSubject(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-topic">Topic</Label>
                    <Input
                      id="practice-topic"
                      className="min-h-11"
                      placeholder="e.g. Fractions"
                      value={topic}
                      maxLength={100}
                      onChange={(event) => setTopic(event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 [&>button]:min-h-11 xl:[&>button]:min-h-0">
              <Button variant="outline" onClick={() => setShowSetup(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleStartPractice} 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Start practice'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
