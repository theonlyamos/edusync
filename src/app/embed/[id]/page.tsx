'use client';

import InteractiveAITutor from "@/components/learn/InteractiveAITutor";

export default function EmbedPage() {
  const onSessionStarted = (sessionId: string) => {
    console.log('Session started:', sessionId);
  };
  const onSessionEnded = (sessionId: string | null) => {
    console.log('Session ended:', sessionId);
  };
  return <InteractiveAITutor onSessionStarted={onSessionStarted} onSessionEnded={onSessionEnded} />;
}