import React from 'react';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

interface StartButtonOverlayProps {
  onStart: () => void;
}

export function StartButtonOverlay({ onStart }: StartButtonOverlayProps) {
  return (
    <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
      <Button
        onClick={onStart}
        size="lg"
        className="w-24 h-24 rounded-full"
      >
        <Play className="w-12 h-12" />
      </Button>
    </div>
  );
}
