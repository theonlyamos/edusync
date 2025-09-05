import React, { useRef, useEffect, useCallback } from 'react';

interface AudioVisualizerProps {
  audioData: Float32Array;
  isActive: boolean;
  analyser?: AnalyserNode | null;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioData, isActive, analyser }) => {
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

    // Draw bars - more bars for thinner appearance
    const numBars = Math.min(64, bufferLength);
    const barWidth = width / numBars;
    const thinBarWidth = Math.max(2, barWidth * 0.6); // Make bars 60% of available width, minimum 2px
    const barSpacing = (barWidth - thinBarWidth) / 2;
    const maxBarHeight = height * 0.8;

    for (let i = 0; i < numBars; i++) {
      const barHeight = (dataArray[i] / 255) * maxBarHeight;
      const x = i * barWidth + barSpacing;
      const y = height - barHeight;

      // Create modern gradient with vibrant colors
      const gradient = canvasCtx.createLinearGradient(0, y, 0, height);
      const hue = (i / numBars) * 120 + 200; // Blue to purple range
      gradient.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.9)`);
      gradient.addColorStop(0.5, `hsla(${hue + 20}, 80%, 70%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue + 40}, 90%, 80%, 0.6)`);

      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, y, thinBarWidth, barHeight);

      // Add a subtle glow effect
      canvasCtx.shadowColor = `hsla(${hue}, 80%, 70%, 0.5)`;
      canvasCtx.shadowBlur = 4;
      canvasCtx.fillRect(x, y, thinBarWidth, barHeight);
      canvasCtx.shadowBlur = 0;
    }

    // Continue animation
    if (isActive) {
      animationRef.current = requestAnimationFrame(drawVisualization);
    }
  }, [isActive, analyser]);

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
