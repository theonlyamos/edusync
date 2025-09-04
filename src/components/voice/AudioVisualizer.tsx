import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  audioData: Float32Array;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioData }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const width = canvas.width;
    const height = canvas.height;

    const numBars = 64;
    const barWidth = width / numBars;

    canvasCtx.clearRect(0, 0, width, height);

    // A simple smoothing algorithm
    const smoothedData = new Float32Array(numBars);
    const windowSize = 4;
    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += audioData[i * windowSize + j] || 0;
      }
      smoothedData[i] = sum / windowSize;
    }

    for (let i = 0; i < numBars; i++) {
      const barHeight = smoothedData[i] * height * 2;
      const x = i * barWidth;
      const y = height - barHeight;

      // Create a gradient for each bar for a multi-colored effect
      const gradient = canvasCtx.createLinearGradient(x, y, x, height);
      gradient.addColorStop(0, `hsl(${i * 360 / numBars}, 100%, 50%)`);
      gradient.addColorStop(1, `hsl(${(i * 360 / numBars) + 60}, 100%, 50%)`);

      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, y, barWidth - 1, barHeight);
    }
  }, [audioData]);

  return <canvas ref={canvasRef} className="w-full h-16" />;
};

export default AudioVisualizer;
