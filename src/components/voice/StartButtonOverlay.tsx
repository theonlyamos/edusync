import React from 'react';
import { Button } from '@/components/ui/button';
import { Power } from 'lucide-react';

interface StartButtonOverlayProps {
  onStart: () => void;
}

export function StartButtonOverlay({ onStart }: StartButtonOverlayProps) {
  return (
    <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
      <div className="flex flex-col items-center gap-4">
        <Button
          onClick={onStart}
          size="lg"
          className="w-24 h-24 rounded-full"
        >
          <Power className="w-12 h-12" />
        </Button>
        <p className="text-lg font-semibold">Start Learning</p>
      </div>
    </div>
  );
}
