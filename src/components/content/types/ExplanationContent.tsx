'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExplanationSection {
  id: string;
  title: string;
  content: string;
  examples?: {
    problem: string;
    solution: string;
    explanation: string;
  }[];
  keyPoints?: string[];
  imageUrl?: string;
}

interface ExplanationContent {
  title: string;
  description: string;
  sections: ExplanationSection[];
  summary?: string;
  prerequisites?: string[];
}

interface ExplanationContentProps {
  content: ExplanationContent;
}

export function ExplanationContent({ content }: ExplanationContentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{content.title}</CardTitle>
        <CardDescription>{content.description}</CardDescription>
        {content.prerequisites && content.prerequisites.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium">Prerequisites:</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {content.prerequisites.map((prereq, index) => (
                <li key={index}>{prereq}</li>
              ))}
            </ul>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={content.sections[0]?.id} className="w-full">
          <TabsList className="w-full justify-start">
            {content.sections.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {content.sections.map((section) => (
            <TabsContent key={section.id} value={section.id} className="space-y-4">
              {section.imageUrl && (
                <img
                  src={section.imageUrl}
                  alt={section.title}
                  className="max-w-full h-auto rounded-lg"
                />
              )}
              
              <div className="prose max-w-none">
                <p>{section.content}</p>
              </div>

              {section.keyPoints && section.keyPoints.length > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="font-medium mb-2">Key Points:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {section.keyPoints.map((point, index) => (
                      <li key={index} className="text-sm">{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {section.examples && section.examples.length > 0 && (
                <div className="mt-6 space-y-4">
                  <p className="font-medium">Examples:</p>
                  {section.examples.map((example, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div>
                        <p className="font-medium text-sm">Problem:</p>
                        <p className="text-sm">{example.problem}</p>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Solution:</p>
                        <p className="text-sm">{example.solution}</p>
                      </div>
                      <div>
                        <p className="font-medium text-sm">Explanation:</p>
                        <p className="text-sm">{example.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {content.summary && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="font-medium mb-2">Summary:</p>
            <p className="text-sm">{content.summary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 