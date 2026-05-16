'use client';

import AudioVisualizer from '@/components/voice/AudioVisualizer';

type LiveWaveformStripProps = {
  audioData: Float32Array;
  analyser: AnalyserNode | null;
  active: boolean;
  aiAnalyser: AnalyserNode | null;
  aiActive: boolean;
};

export function LiveWaveformStrip({
  audioData,
  analyser,
  active,
  aiAnalyser,
  aiActive,
}: LiveWaveformStripProps) {
  const showAiLayer = Boolean(aiAnalyser) && aiActive;

  return (
    <div
      className="relative h-11 w-[5.5rem] shrink-0 overflow-hidden rounded-full bg-transparent"
      aria-hidden
    >
      <AudioVisualizer audioData={audioData} isActive={active} analyser={analyser} variant="mic" />
      {showAiLayer ? (
        <div className="pointer-events-none absolute inset-0">
          <AudioVisualizer audioData={audioData} isActive analyser={aiAnalyser} variant="mic-ai" />
        </div>
      ) : null}
    </div>
  );
}
