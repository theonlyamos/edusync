import React, { useRef, useEffect, useCallback } from 'react';

export type AudioVisualizerVariant = 'ai' | 'mic' | 'mic-ai';

interface AudioVisualizerProps {
  audioData: Float32Array;
  isActive: boolean;
  analyser?: AnalyserNode | null;
  variant?: AudioVisualizerVariant;
}

type CenterSpreadStyle = 'neutral' | 'aiGradient';

/** Shared geometry for Study Companion mic strip: symmetric capsules, FFT mapped from horizontal center. */
function drawCenterSpreadCapsules(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dataArray: Uint8Array,
  bufferLength: number,
  numBars: number,
  style: CenterSpreadStyle,
): void {
  const slotWidth = width / numBars;
  const thinBarWidth = Math.max(2, slotWidth * 0.42);
  const gap = (slotWidth - thinBarWidth) / 2;
  const maxHalf = height * 0.44;
  const minHalf = thinBarWidth * 0.45;
  const cx = (numBars - 1) / 2;
  const maxDist = cx > 0 ? cx : 1;

  for (let i = 0; i < numBars; i++) {
    const distFromCenter = Math.abs(i - cx);
    const t = distFromCenter / maxDist;
    const bin = Math.min(bufferLength - 1, Math.floor(t * (bufferLength - 1)));
    const amp = dataArray[bin] / 255;
    const halfH = Math.max(minHalf, amp * maxHalf);
    const x = i * slotWidth + gap;
    const y = height / 2 - halfH;
    const h = halfH * 2;
    const r = thinBarWidth / 2;

    if (style === 'neutral') {
      ctx.fillStyle = 'rgba(212, 212, 216, 0.92)';
    } else {
      const hue = (i / numBars) * 120 + 200;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `hsla(${hue}, 72%, 62%, 0.82)`);
      g.addColorStop(0.5, `hsla(${hue + 20}, 78%, 58%, 0.76)`);
      g.addColorStop(1, `hsla(${hue + 40}, 82%, 52%, 0.68)`);
      ctx.fillStyle = g;
    }

    ctx.beginPath();
    ctx.roundRect(x, y, thinBarWidth, h, r);
    ctx.fill();
  }
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioData, isActive, analyser, variant = 'ai' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || !isActive) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, width, height);

    const stripBars = variant === 'mic' || variant === 'mic-ai';
    const numBars = Math.min(stripBars ? 42 : 64, bufferLength);

    if (variant === 'mic' || variant === 'mic-ai') {
      drawCenterSpreadCapsules(
        canvasCtx,
        width,
        height,
        dataArray,
        bufferLength,
        numBars,
        variant === 'mic' ? 'neutral' : 'aiGradient',
      );
    } else {
      const barWidth = width / numBars;
      const thinBarWidth = Math.max(2, barWidth * 0.6);
      const barSpacing = (barWidth - thinBarWidth) / 2;
      const maxBarHeight = height * 0.8;

      for (let i = 0; i < numBars; i++) {
        const bin = Math.min(bufferLength - 1, Math.floor(((i + 0.5) / numBars) * bufferLength));
        const barHeight = (dataArray[bin] / 255) * maxBarHeight;
        const x = i * barWidth + barSpacing;
        const y = height - barHeight;

        const gradient = canvasCtx.createLinearGradient(0, y, 0, height);
        const hue = (i / numBars) * 120 + 200;
        gradient.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.9)`);
        gradient.addColorStop(0.5, `hsla(${hue + 20}, 80%, 70%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue + 40}, 90%, 80%, 0.6)`);

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, y, thinBarWidth, barHeight);

        canvasCtx.shadowColor = 'rgba(99, 102, 241, 0.5)';
        canvasCtx.shadowBlur = 4;
        canvasCtx.fillRect(x, y, thinBarWidth, barHeight);
        canvasCtx.shadowBlur = 0;
      }
    }

    if (isActive) {
      animationRef.current = requestAnimationFrame(drawVisualization);
    }
  }, [isActive, analyser, variant]);

  useEffect(() => {
    if (isActive && analyser) {
      drawVisualization();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const canvasCtx = canvas.getContext('2d');
        if (canvasCtx) {
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, analyser, drawVisualization]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: 'auto' }}
    />
  );
};

export default AudioVisualizer;
