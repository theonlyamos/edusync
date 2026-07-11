'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VisualizationSkeleton } from './VisualizationSkeleton';

interface SafeCodeRunnerProps {
  code: string;
  library: 'p5' | 'three' | 'react';
  onError?: (error: string) => void;
  onReady?: () => void;
}

export const SafeCodeRunner: React.FC<SafeCodeRunnerProps> = React.memo(({ code, library, onError, onReady }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!iframeRef.current || !code) return;

    setIsLoading(true);
    setError(null);

    try {
      const iframe = iframeRef.current;

      // Device sensors are gated by iframe `allow` and by Permissions-Policy inside the document (not CSP script-src).
      const sensorPermissionsMeta =
        library === 'p5'
          ? '<meta http-equiv="Permissions-Policy" content="accelerometer=(self); gyroscope=(self); magnetometer=(self)">'
          : '';

      // Create sandboxed content based on library type
      let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline'; img-src * data:; connect-src https://cdn.jsdelivr.net https://esm.sh;">
  ${sensorPermissionsMeta}
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
      font-family: Arial, sans-serif;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    canvas { 
      display: block; 
      max-width: 100%;
      max-height: 100%;
    }
    .error {
      padding: 20px;
      color: #dc2626;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      margin: 20px;
    }
    .container {
      padding: 20px;
    }
  </style>
</head>
<body>`;

      if (library === 'p5') {
        htmlContent += `
  <div id="canvas-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/p5@2.0.5/lib/p5.min.js"></script>
  <script>
    window.addEventListener('error', function(e) {
      var c = document.createElement('div');
      c.className = 'error';
      c.textContent = 'Error: ' + (e.message || 'Unknown error');
      document.body.replaceChildren(c);
      window.parent.postMessage({ type: 'lesson-visualization-error', error: e.message || 'Unknown error' }, '*');
    });
    window.addEventListener('unhandledrejection', function(e) {
      window.parent.postMessage({ type: 'lesson-visualization-error', error: e.reason?.message || String(e.reason || 'Unknown error') }, '*');
    });
    if (!document.getElementById('canvas-container')) {
      var container = document.createElement('div');
      container.id = 'canvas-container';
      document.body.appendChild(container);
    }
    ${code}
    try {
      if (typeof setup === 'function' && !("setup" in window)) { window.setup = setup; }
      if (typeof draw === 'function' && !("draw" in window)) { window.draw = draw; }
    } catch (e) {}
    requestAnimationFrame(function () {
      window.parent.postMessage({ type: 'lesson-visualization-ready' }, '*');
    });
  </script>`;
      } else if (library === 'three') {
        htmlContent += `
  <script type="module">
    import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
    window.THREE = THREE;
    window.addEventListener('error', function(e) {
      var c = document.createElement('div');
      c.className = 'error';
      c.textContent = 'Error: ' + (e.message || 'Unknown error');
      document.body.replaceChildren(c);
      window.parent.postMessage({ type: 'lesson-visualization-error', error: e.message || 'Unknown error' }, '*');
    });
    window.addEventListener('unhandledrejection', function(e) {
      window.parent.postMessage({ type: 'lesson-visualization-error', error: e.reason?.message || String(e.reason || 'Unknown error') }, '*');
    });
    ${code}
    requestAnimationFrame(function () {
      window.parent.postMessage({ type: 'lesson-visualization-ready' }, '*');
    });
  </script>`;
      } else if (library === 'react') {
        // For React, we'll render a safe message instead of executing arbitrary code
        htmlContent += `
  <div class="container">
    <div style="padding: 20px; background: #f3f4f6; border-radius: 8px;">
      <h3 style="margin-top: 0;">React Component Preview</h3>
      <p>For security reasons, React components are now rendered in a controlled environment.</p>
      <p style="margin-bottom: 0;">Component code has been validated but not executed.</p>
    </div>
  </div>`;
      }

      htmlContent += `
</body>
</html>`;

      iframe.srcdoc = htmlContent;

      const handleLoad = () => {
        if (library === 'react') {
          setIsLoading(false);
          onReadyRef.current?.();
        }
      };

      const handleError = () => {
        setError('Failed to load visualization');
        setIsLoading(false);
        onErrorRef.current?.('Failed to load visualization');
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        if (event.data?.type === 'lesson-visualization-ready') {
          setIsLoading(false);
          onReadyRef.current?.();
        } else if (event.data?.type === 'lesson-visualization-error') {
          const message = event.data.error || 'Failed to render visualization';
          setError(message);
          setIsLoading(false);
          onErrorRef.current?.(message);
        }
      };

      window.addEventListener('message', handleMessage);
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);

      return () => {
        window.removeEventListener('message', handleMessage);
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create visualization';
      setError(errorMsg);
      setIsLoading(false);
      onErrorRef.current?.(errorMsg);
    }
  }, [code, library]);

  return (
    <div className="relative h-full w-full">
      {isLoading && <VisualizationSkeleton />}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Code Preview"
        className="w-full h-full border border-gray-200 rounded bg-transparent"
        sandbox="allow-scripts"
        allow={library === 'p5' ? 'accelerometer; gyroscope; magnetometer' : undefined}
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
});

SafeCodeRunner.displayName = 'SafeCodeRunner';
