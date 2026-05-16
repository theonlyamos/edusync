'use client';

import AudioVisualizer from '@/components/voice/AudioVisualizer';

type LiveWaveformStripProps = {
  audioData: Float32Array;
  analyser: AnalyserNode | null;
  active: boolean;
};

export function LiveWaveformStrip({ audioData, analyser, active }: LiveWaveformStripProps) {
  return (
    <div
      className="relative h-11 w-[5.5rem] shrink-0 overflow-hidden rounded-full bg-transparent"
      aria-hidden
    >
      <AudioVisualizer audioData={audioData} isActive={active} analyser={analyser} variant="mic" />
    </div>
  );
}
