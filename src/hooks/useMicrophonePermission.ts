import { useState, useEffect, useCallback } from 'react';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

interface MicrophonePermissionState {
    permission: PermissionState;
    isLoading: boolean;
    error: string;
}

interface MicrophonePermissionActions {
    requestPermission: () => Promise<boolean>;
    testMicrophone: () => Promise<boolean>;
    clearError: () => void;
}

export function useMicrophonePermission(): MicrophonePermissionState & MicrophonePermissionActions {
    const [permission, setPermission] = useState<PermissionState>('unknown');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const checkPermission = useCallback(async () => {
        try {
            if (navigator.permissions) {
                const permissionStatus = await navigator.permissions.query({
                    name: 'microphone' as PermissionName
                });
                setPermission(permissionStatus.state);

                permissionStatus.onchange = () => {
                    setPermission(permissionStatus.state);
                };
            } else {
                setPermission('unknown');
            }
        } catch (error) {
            console.error('Error checking microphone permission:', error);
            setPermission('unknown');
        }
    }, []);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        setIsLoading(true);
        setError('');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());

            setPermission('granted');
            return true;
        } catch (error: any) {
            console.error('Microphone permission denied:', error);

            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setPermission('denied');
                setError('Microphone access denied. Please allow microphone access in your browser settings.');
            } else if (error.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else if (error.name === 'NotSupportedError') {
                setError('Microphone access is not supported in this browser.');
            } else {
                setError('Failed to access microphone. Please check your browser settings.');
            }

            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const testMicrophone = useCallback(async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error: any) {
            console.error('Microphone test failed:', error);
            return false;
        }
    }, []);

    const clearError = useCallback(() => {
        setError('');
    }, []);

    useEffect(() => {
        checkPermission();
    }, [checkPermission]);

    return {
        permission,
        isLoading,
        error,
        requestPermission,
        testMicrophone,
        clearError,
    };
} 