import React from 'react';
import { Button } from '@/components/ui/button';
import { Power, Loader, AlertTriangle } from 'lucide-react';

interface StartButtonOverlayProps {
  onStart: () => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  outOfCredits?: boolean;
  remainingCredits?: number;
  creditsLoading?: boolean;
}

export function StartButtonOverlay({ onStart, connectionStatus, outOfCredits = false, remainingCredits, creditsLoading = false }: StartButtonOverlayProps) {
  const isConnecting = connectionStatus === 'connecting';

  if (creditsLoading) {
    return (
      <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10">
        <Loader className="w-12 h-12 animate-spin" />
        {/* <div className="mt-4 text-lg font-medium">Checking credits...</div> */}
      </div>
    );
  }

  if (outOfCredits) {
    return (
      <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full border border-yellow-300 bg-yellow-100/60 flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-yellow-700" />
          </div>
          <div className="mt-4 text-lg font-medium text-yellow-800">No credits remaining</div>
          {typeof remainingCredits === 'number' && (
            <div className="text-sm text-yellow-700">{remainingCredits} credits available</div>
          )}
          <div className="mt-4">
            <Button asChild>
              <a href="/learn/credits">Buy Credits</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
