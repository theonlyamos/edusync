'use client';

import { Card, CardContent } from '@/components/ui/card';

export interface SummaryContentType {
  title: string;
  description: string;
  mainPoints: string[];
  conclusion: string;
}

export function SummaryContent({ content }: { content: SummaryContentType }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{content.title}</h2>
      <p className="text-muted-foreground">{content.description}</p>

      <div className="space-y-4">
        <h3 className="font-medium">Main Points</h3>
        <ul className="list-disc pl-5 space-y-2">
          {content.mainPoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium mb-2">Conclusion</h3>
        <p>{content.conclusion}</p>
      </div>
    </div>
  );
} 