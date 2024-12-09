'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { 
  BookOpen, 
  FileText, 
  HelpCircle, 
  ListChecks 
} from 'lucide-react';

const contentTypes = [
  {
    title: 'Quizzes',
    description: 'Create interactive quizzes with multiple choice, true/false, and short answer questions.',
    icon: ListChecks,
    href: '/teachers/content/quiz',
    color: 'text-blue-500'
  },
  {
    title: 'Worksheets',
    description: 'Generate practice problems and exercises with step-by-step solutions.',
    icon: FileText,
    href: '/teachers/content/worksheet',
    color: 'text-green-500'
  },
  {
    title: 'Explanations',
    description: 'Create detailed explanations with examples and key points.',
    icon: HelpCircle,
    href: '/teachers/content/explanation',
    color: 'text-purple-500'
  },
  {
    title: 'Summaries',
    description: 'Generate concise summaries with main ideas and related concepts.',
    icon: BookOpen,
    href: '/teachers/content/summary',
    color: 'text-orange-500'
  }
];

export default function ContentPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Content Creation</h1>
        <div className="grid gap-6 md:grid-cols-2">
          {contentTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Card key={type.title} className="hover:shadow-lg transition-shadow">
                <Link href={type.href}>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-muted ${type.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <CardTitle>{type.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {type.description}
                    </p>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
} 