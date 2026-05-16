import React, { useRef, useEffect, useCallback } from 'react';

interface AudioVisualizerProps {
  audioData: Float32Array;
  isActive: boolean;
  analyser?: AnalyserNode | null;
  variant?: 'ai' | 'mic';
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioData, isActive, analyser, variant = 'ai' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || !isActive) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    // Set canvas size to match its display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Get frequency data from the real audio analyser
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Clear canvas
    canvasCtx.clearRect(0, 0, width, height);

    const numBars = Math.min(variant === 'mic' ? 42 : 64, bufferLength);

    if (variant === 'mic') {
      // Minimal centered bars; FFT energy spreads from horizontal middle (low bins center → highs at edges)
      const slotWidth = width / numBars;
      const thinBarWidth = Math.max(2, slotWidth * 0.42);
      const gap = (slotWidth - thinBarWidth) / 2;
      const maxHalf = height * 0.44;
      const minHalf = thinBarWidth * 0.45;
      const cx = (numBars - 1) / 2;
      const maxDist = cx > 0 ? cx : 1;

      canvasCtx.fillStyle = 'rgba(212, 212, 216, 0.92)'; // zinc-300-ish

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

        canvasCtx.beginPath();
        canvasCtx.roundRect(x, y, thinBarWidth, h, r);
        canvasCtx.fill();
      }
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

    // Continue animation
    if (isActive) {
      animationRef.current = requestAnimationFrame(drawVisualization);
    }
  }, [isActive, analyser, variant]);

  // Start/stop animation based on isActive
  useEffect(() => {
    if (isActive && analyser) {
      drawVisualization();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Clear canvas when inactive
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

  // Cleanup on unmount
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
