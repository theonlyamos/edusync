'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TutorExperience } from '@/components/learn/tutor/TutorExperience';

type InteractiveAITutorProps = {
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
};

export const InteractiveAITutorComponent = ({ onSessionStarted, onSessionEnded }: InteractiveAITutorProps) => {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get('apiKey');
  const topicFromUrl = searchParams.get('topic');
  const debugMode = searchParams.get('debug') === 'true';
  const getFeedback = searchParams.get('getFeedback') === 'true';

  return (
    <TutorExperience
      variant="embed"
      apiKey={apiKey}
      getFeedback={getFeedback}
      debugMode={debugMode}
      initialTopic={topicFromUrl}
      onSessionStarted={onSessionStarted}
      onSessionEnded={onSessionEnded}
    />
  );
};

export default function InteractiveAITutor(props: InteractiveAITutorProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InteractiveAITutorComponent {...props} />
    </Suspense>
  );
}
