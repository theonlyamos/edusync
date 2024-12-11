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

const subjects = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
];

const topics = {
  Mathematics: [
    'Algebra',
    'Geometry',
    'Calculus',
    'Statistics',
    'Trigonometry',
  ],
  Physics: [
    'Mechanics',
    'Thermodynamics',
    'Electricity',
    'Magnetism',
    'Optics',
  ],
  Chemistry: [
    'Organic Chemistry',
    'Inorganic Chemistry',
    'Physical Chemistry',
    'Analytical Chemistry',
  ],
  Biology: [
    'Cell Biology',
    'Genetics',
    'Ecology',
    'Evolution',
    'Physiology',
  ],
  'Computer Science': [
    'Programming',
    'Data Structures',
    'Algorithms',
    'Databases',
    'Web Development',
  ],
};

const practiceCategories = [
  {
    title: 'Quick Practice',
    description: 'Short exercises based on recent lessons',
    icon: Target,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    type: 'quick',
    difficulty: 'adaptive',
  },
  {
    title: 'Problem Solving',
    description: 'Complex problems that test your understanding',
    icon: Brain,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    type: 'problem_solving',
    difficulty: 'hard',
  },
  {
    title: 'Skill Assessment',
    description: 'Test your knowledge in specific areas',
    icon: Calculator,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    type: 'assessment',
    difficulty: 'medium',
  },
  {
    title: 'Challenge Mode',
    description: 'Advanced problems for extra practice',
    icon: Lightbulb,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    type: 'challenge',
    difficulty: 'expert',
  },
];

export default function PracticePage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [subject, setSubject] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [practicing, setPracticing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState({
    averageScore: 0,
    exercisesCompleted: 0,
    streak: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/students/practice/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats({
        averageScore: data.averageScore || 0,
        exercisesCompleted: data.totalExercisesCompleted || 0,
        streak: data.currentStreak || 0,
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
    setShowSetup(true);
  };

  const handleStartPractice = async () => {
    if (!subject || !topic) {
      toast({
        title: 'Missing Information',
        description: 'Please select both a subject and topic.',
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
          subject,
          topic,
          difficulty: category?.difficulty || 'medium',
          type: selectedCategory,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate exercises');

      const data = await response.json();
      setQuestions(data.questions);
      setShowSetup(false);
      setPracticing(true);
    } catch (error) {
      console.error('Error generating exercises:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate exercises. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePracticeComplete = async (score: number) => {
    setLoadingStats(true);
    try {
      await fetchStats();
      setPracticing(false);
      setSelectedCategory(null);
      toast({
        title: 'Practice Complete!',
        description: `You scored ${score}%. Keep up the good work!`,
      });
    } finally {
      setLoadingStats(false);
    }
  };

  if (practicing) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <PracticeExercise
            subject={subject}
            topic={topic}
            questions={questions}
            onComplete={handlePracticeComplete}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">Practice Exercises</h2>
          <p className="text-muted-foreground">
            Choose a category to start practicing
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {practiceCategories.map((category) => (
            <Card
              key={category.title}
              className="cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              onClick={() => handleCategorySelect(category.type)}
            >
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${category.bgColor}`}>
                    <category.icon className={`h-6 w-6 ${category.color}`} />
                  </div>
                  <div>
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
          <h3 className="text-xl font-semibold mb-4">Your Progress</h3>
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
                    <p className="text-sm text-muted-foreground">Average Score</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-secondary mb-2">
                      {stats.exercisesCompleted}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Exercises Completed
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent mb-2">
                      {stats.streak}
                    </div>
                    <p className="text-sm text-muted-foreground">Practice Streak</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Setup Dialog */}
        <Dialog open={showSetup} onOpenChange={setShowSetup}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Practice Setup</DialogTitle>
              <DialogDescription>
                Choose a subject and topic to begin practicing
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Topic</Label>
                <Select
                  value={topic}
                  onValueChange={setTopic}
                  disabled={!subject}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    {subject &&
                      topics[subject as keyof typeof topics].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
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
                  'Start Practice'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
} 