'use client';

import InteractiveAITutor from "@/components/learn/InteractiveAITutor";

export default function EmbedNewPage() {
    const onSessionStarted = (sessionId: string) => {
        console.warn('Session started:', sessionId);
    };
    const onSessionEnded = (sessionId: string | null) => {
        console.warn('Session ended:', sessionId);
    };
    return <InteractiveAITutor onSessionStarted={onSessionStarted} onSessionEnded={onSessionEnded} />;
}
