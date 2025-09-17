// LiveSketch: Renders p5.js or Three.js code in a sandboxed iframe
import { useEffect, useRef, useState } from 'react';

interface LiveSketchProps {
  code: string;
  library: 'p5' | 'three';
}

export const LiveSketch: React.FC<LiveSketchProps> = ({ code, library }: LiveSketchProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current || !code) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (!doc) {
        setError('Unable to access iframe document');
        setIsLoading(false);
        return;
      }

      doc.open();
      
      let htmlContent = `<!DOCTYPE html>
<html>
<head>
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
  </style>
</head>
<body>`;

      if (library === 'p5') {
        htmlContent += `
  <script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
  <script>
    try {
      ${code}
    } catch (error) {
      document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: ' + error.message + '</div>';
    }
  </script>`;
      } else if (library === 'three') {
        htmlContent += `
  <script src="https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.min.js"></script>
  <script>
    try {
      ${code}
    } catch (error) {
      document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: ' + error.message + '</div>';
    }
  </script>`;
      }

      htmlContent += `
</body>
</html>`;

      doc.write(htmlContent);
      doc.close();

      const handleLoad = () => {
        setIsLoading(false);
      };

      const handleError = () => {
        setError('Failed to load visualization');
        setIsLoading(false);
      };

      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);

      return () => {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      };
    } catch (err) {
      setError('Failed to create visualization');
      setIsLoading(false);
    }
  }, [code, library]);

  return (
    <div className="relative">
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
        title="Live Sketch Preview"
        className="w-full h-full min-h-[400px] border border-gray-200 rounded bg-white"
        sandbox="allow-scripts allow-same-origin"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
}
