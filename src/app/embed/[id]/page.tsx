'use client';

import InteractiveAITutor from "@/components/learn/InteractiveAITutor";
import { EmbedTheme } from "@/components/developers/EmbedTheme";

export default function EmbedPage() {
  const onSessionStarted = (sessionId: string) => {
    console.warn('Session started:', sessionId);
  };
  const onSessionEnded = (sessionId: string | null) => {
    console.warn('Session ended:', sessionId);
  };
  return (
    <>
      <EmbedTheme />
      <InteractiveAITutor onSessionStarted={onSessionStarted} onSessionEnded={onSessionEnded} />
    </>
  );
}
