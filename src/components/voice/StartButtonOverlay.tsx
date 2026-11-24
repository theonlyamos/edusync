import React from 'react';
import { Button } from '@/components/ui/button';
import { Power, Loader, AlertTriangle, NotebookText } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface StartButtonOverlayProps {
  onStart: () => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  outOfCredits?: boolean;
  remainingCredits?: number;
  creditsLoading?: boolean;
  hideCredits?: boolean;
  error?: string;
  /** Where students go if they'd rather not start a voice session. */
  backHref?: string;
  backLabel?: string;
  /** Lets the learner choose whiteboard mode before the session starts. */
  whiteboard?: { enabled: boolean; onChange: (enabled: boolean) => void };
  /** Set when the last whiteboard lesson left notes to read back. */
  notes?: { onOpen: () => void };
}

export function StartButtonOverlay({ onStart, connectionStatus, outOfCredits = false, remainingCredits, creditsLoading = false, hideCredits = false, error, backHref, backLabel = 'Back', whiteboard, notes }: StartButtonOverlayProps) {
  const isConnecting = connectionStatus === 'connecting';

  // Skip credit loading check if hideCredits is true
  if (!hideCredits && creditsLoading) {
    return (
      <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-10">
        <Loader className="w-12 h-12 animate-spin" />
        {/* <div className="mt-4 text-lg font-medium">Checking credits...</div> */}
      </div>
    );
  }

  // Skip out of credits check if hideCredits is true
  if (!hideCredits && outOfCredits) {
    return (
      <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-6">
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
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-10">
      <Button
        onClick={onStart}
        size="lg"
        className="w-24 h-24 rounded-full"
        aria-label={isConnecting ? 'Connecting' : error ? 'Try again' : 'Start Learning'}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <Loader className="w-12 h-12 animate-spin" />
        ) : (
          <Power className="w-12 h-12" />
        )}
      </Button>
      <div className="mt-4 text-lg font-medium">
        {isConnecting ? 'Connecting...' : error ? 'Try again' : 'Start Learning'}
      </div>
      {error && <div role="alert" className="mx-6 mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      {whiteboard && (
        <label className="mx-6 mt-5 flex min-h-11 max-w-sm cursor-pointer items-center gap-3 rounded-xl border bg-background/80 px-4 py-2 text-left">
          <Switch
            checked={whiteboard.enabled}
            onCheckedChange={whiteboard.onChange}
            disabled={isConnecting}
            aria-describedby="whiteboard-mode-hint"
          />
          <span>
            <span className="block text-sm font-medium">Whiteboard</span>
            <span id="whiteboard-mode-hint" className="block text-xs text-muted-foreground">Your tutor writes and draws as it explains, with captions.</span>
          </span>
        </label>
      )}
      {notes && !isConnecting && (
        <Button type="button" variant="outline" className="mt-5 min-h-11" onClick={notes.onOpen}>
          <NotebookText className="mr-2 h-4 w-4" aria-hidden /> Notes from your last lesson
        </Button>
      )}
      {backHref && !isConnecting && (
        <a href={backHref} className="mt-6 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {backLabel}
        </a>
      )}
    </div>
  );
}
