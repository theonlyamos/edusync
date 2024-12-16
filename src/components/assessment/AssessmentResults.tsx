'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Award, Clock, Target, Users } from 'lucide-react';

interface AssessmentResult {
  _id: string;
  studentId: {
    _id: string;
    name: string;
    email: string;
  };
  answers: {
    questionId: string;
    answer: string;
    isCorrect: boolean;
    points: number;
  }[];
  totalScore: number;
  percentage: number;
  status: 'passed' | 'failed';
  startedAt: string;
  submittedAt: string;
  timeSpent: number;
}

interface Statistics {
  totalSubmissions: number;
  averageScore: number;
  passRate: number;
  averageTimeSpent: number;
}

interface AssessmentResultsProps {
  results: AssessmentResult[];
  statistics: Statistics;
  questions: {
    _id: string;
    question: string;
    type: string;
    points: number;
  }[];
  userRole: 'teacher' | 'admin' | 'student';
}

export function AssessmentResults({
  results,
  statistics,
  questions,
  userRole,
}: AssessmentResultsProps) {
  const [selectedTab, setSelectedTab] = useState('overview');

  const scoreDistribution = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}`,
    count: results.filter(
      (r) => r.percentage >= i * 10 && r.percentage < (i + 1) * 10
    ).length,
  }));

  const questionAnalysis = questions.map((q) => {
    const attempts = results.flatMap((r) =>
      r.answers.filter((a) => a.questionId === q._id)
    );
    const correctCount = attempts.filter((a) => a.isCorrect).length;
    return {
      question: q.question,
      correctPercentage: (correctCount / attempts.length) * 100,
      totalAttempts: attempts.length,
    };
  });

  const StatCard = ({ title, value, icon: Icon }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Submissions"
          value={statistics.totalSubmissions}
          icon={Users}
        />
        <StatCard
          title="Average Score"
          value={`${statistics.averageScore.toFixed(1)}%`}
          icon={Target}
        />
        <StatCard
          title="Pass Rate"
          value={`${statistics.passRate.toFixed(1)}%`}
          icon={Award}
        />
        <StatCard
          title="Avg. Time Spent"
          value={`${statistics.averageTimeSpent.toFixed(0)} min`}
          icon={Clock}
        />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="individual">Individual Results</TabsTrigger>
          <TabsTrigger value="questions">Question Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
              <CardDescription>
                Distribution of scores across all submissions
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="individual">
          <Card>
            <CardHeader>
              <CardTitle>Individual Results</CardTitle>
              <CardDescription>
                Detailed results for each submission
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {userRole !== 'student' && <TableHead>Student</TableHead>}
                    <TableHead>Score</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time Spent</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result._id}>
                      {userRole !== 'student' && (
                        <TableCell>{result.studentId.name}</TableCell>
                      )}
                      <TableCell>
                        {result.totalScore} / {questions.reduce((acc, q) => acc + q.points, 0)}
                      </TableCell>
                      <TableCell>{result.percentage.toFixed(1)}%</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            result.status === 'passed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {result.status}
                        </span>
                      </TableCell>
                      <TableCell>{result.timeSpent} min</TableCell>
                      <TableCell>
                        {new Date(result.submittedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardHeader>
              <CardTitle>Question Analysis</CardTitle>
              <CardDescription>
                Performance breakdown by question
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={questionAnalysis}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis
                    type="category"
                    dataKey="question"
                    width={150}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="correctPercentage" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 