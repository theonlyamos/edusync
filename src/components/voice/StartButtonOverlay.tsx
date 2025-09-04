import React from 'react';
import { Button } from '@/components/ui/button';
import { Power, Loader } from 'lucide-react';

interface StartButtonOverlayProps {
  onStart: () => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

export function StartButtonOverlay({ onStart, connectionStatus }: StartButtonOverlayProps) {
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10">
      <Button
        onClick={onStart}
        size="lg"
        className="w-24 h-24 rounded-full"
        disabled={isConnecting}
      >
        {isConnecting ? (
          <Loader className="w-12 h-12 animate-spin" />
        ) : (
          <Power className="w-12 h-12" />
        )}
      </Button>
      <div className="mt-4 text-lg font-medium">
        {isConnecting ? 'Connecting...' : 'Start Learning'}
      </div>
    </div>
  );
}
