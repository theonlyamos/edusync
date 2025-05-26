// LiveSketch: Renders p5.js or Three.js code in a sandboxed iframe
import { useEffect, useRef } from 'react';

interface LiveSketchProps {
  code: string;
  library: 'p5' | 'three';
}

export const LiveSketch: React.FC<LiveSketchProps> =({ code, library }: LiveSketchProps) =>{
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    // Clear previous content
    doc.open();
    doc.write('<!DOCTYPE html><html><head><style>body{margin:0;overflow:hidden;background:#fff;}</style>');
    if (library === 'p5') {
      doc.write('<script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>');
      doc.write('</head><body><script>');
      doc.write(code);
      doc.write('</script></body></html>');
    } else if (library === 'three') {
      doc.write('<script src="https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.min.js"></script>');
      doc.write('</head><body><script>');
      doc.write(code);
      doc.write('</script></body></html>');
    }
    doc.close();
  }, [code, library]);

  return (
    <iframe
      ref={iframeRef}
      title="Live Sketch Preview"
      style={{ width: '100%', height: 350, border: '1px solid #eee', background: '#fff' }}
      sandbox="allow-scripts"
    />
  );
}
