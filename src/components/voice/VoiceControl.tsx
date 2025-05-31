import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';

interface VoiceControlProps {
  onError?: (error: string) => void;
}

export function VoiceControl({ onError }: VoiceControlProps) {
  const { 
    isStreaming, 
    audioUrl, 
    error: streamingError, 
    startStreaming, 
    stopStreaming,
    clearError: clearStreamingError
  } = useAudioStreaming();

  const {
    permission,
    isLoading: permissionLoading,
    error: permissionError,
    requestPermission,
    testMicrophone,
    clearError: clearPermissionError
  } = useMicrophonePermission();

  const handleMicClick = async () => {
    if (isStreaming) {
      await stopStreaming();
      return;
    }

    // Clear any previous errors
    clearStreamingError();
    clearPermissionError();

    // Check permission
    if (permission === 'denied') {
      const error = 'Microphone access denied. Please enable microphone access in browser settings.';
      onError?.(error);
      return;
    }

    // Request permission if needed
    if (permission !== 'granted') {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        onError?.(permissionError);
        return;
      }
    }

    // Test microphone
    const micWorking = await testMicrophone();
    if (!micWorking) {
      const error = 'Microphone test failed. Please check your microphone.';
      onError?.(error);
      return;
    }

    // Start streaming
    await startStreaming();
    if (streamingError) {
      onError?.(streamingError);
    }
  };

  const getMicButtonColor = () => {
    if (permission === 'denied') return 'text-gray-400';
    if (isStreaming) return 'text-red-500 animate-pulse';
    if (permission === 'granted') return 'text-green-600';
    return 'text-yellow-600';
  };

  const getMicButtonTitle = () => {
    if (permission === 'denied') return 'Microphone access denied. Please enable in browser settings.';
    if (permission === 'prompt' || permission === 'unknown') return 'Click to request microphone access';
    if (isStreaming) return 'Stop voice streaming';
    return 'Start voice streaming';
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button 
          type="button" 
          variant={isStreaming ? 'secondary' : 'outline'} 
          size="icon" 
          onClick={handleMicClick} 
          disabled={permission === 'denied' || permissionLoading}
          title={getMicButtonTitle()}
        >
          <Mic className={`w-5 h-5 ${getMicButtonColor()}`} />
        </Button>
      </div>

      {/* Permission status indicator */}
      {permission !== 'granted' && permission !== 'unknown' && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            permission === 'denied' ? 'bg-red-500' : 'bg-yellow-500'
          }`} />
          <span className={`text-xs ${
            permission === 'denied' ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {permission === 'denied' 
              ? 'Microphone access denied' 
              : 'Microphone permission required'
            }
          </span>
        </div>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-500">Streaming audio...</span>
          <span className="ml-2 text-xs text-muted-foreground">Click mic to stop</span>
        </div>
      )}

      {/* Audio playback */}
      {audioUrl && !isStreaming && (
        <div>
          <audio src={audioUrl} controls autoPlay />
        </div>
      )}
    </div>
  );
} 