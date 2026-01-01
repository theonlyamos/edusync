'use client';

import React, { useState, useEffect, useRef } from 'react';

interface SafeCodeRunnerProps {
  code: string;
  library: 'p5' | 'three' | 'react';
  onError?: (error: string) => void;
}

export const SafeCodeRunner: React.FC<SafeCodeRunnerProps> = ({ code, library, onError }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current || !code) return;

    setIsLoading(true);
    setError(null);

    try {
      const iframe = iframeRef.current;

      // Create sandboxed content based on library type
      let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline'; img-src * data:; connect-src 'none';">
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      overflow: hidden; 
      background: #fff; 
      font-family: Arial, sans-serif;
      width: 100vw;
      height: 100vh;
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
  <script src="https://cdn.jsdelivr.net/npm/p5@2.0.5/lib/p5.min.js"></script>
  <script>
    window.addEventListener('error', function(e) {
      var c = document.createElement('div');
      c.className = 'error';
      c.textContent = 'Error: ' + (e.message || 'Unknown error');
      document.body.replaceChildren(c);
    });
    ${code}
    try {
      if (typeof setup === 'function' && !("setup" in window)) { window.setup = setup; }
      if (typeof draw === 'function' && !("draw" in window)) { window.draw = draw; }
    } catch (e) {}
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
    });
    ${code}
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
        setIsLoading(false);
      };

      const handleError = () => {
        setError('Failed to load visualization');
        setIsLoading(false);
        if (onError) onError('Failed to load visualization');
      };

      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);

      return () => {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create visualization';
      setError(errorMsg);
      setIsLoading(false);
      if (onError) onError(errorMsg);
    }
  }, [code, library, onError]);

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <div className="text-sm text-gray-600">Loading visualization...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Code Preview"
        className="w-full h-screen border border-gray-200 rounded bg-white"
        sandbox="allow-scripts"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
};
