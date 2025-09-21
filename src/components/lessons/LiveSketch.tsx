// LiveSketch: Renders p5.js or Three.js code in a sandboxed iframe
import { SafeCodeRunner } from './SafeCodeRunner';

interface LiveSketchProps {
  code: string;
  library: 'p5' | 'three';
}

export const LiveSketch: React.FC<LiveSketchProps> = ({ code, library }: LiveSketchProps) => {
  // Use the SafeCodeRunner component which provides proper sandboxing
  return <SafeCodeRunner code={code} library={library} />;
}
