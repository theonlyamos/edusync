/** Client-side wrapper for `/api/genai/visualize` (Study Companion voice, future regenerate). */

export const STUDY_COMPANION_VIZ_PANEL = { width: 704, height: 504 } as const;

export type GenAiVisualizeLibrary = 'p5' | 'three' | 'react';

export type GenAiVisualizeResult = {
    explanation: string;
    code: string;
    library: GenAiVisualizeLibrary;
};

export async function requestVisualizationFromGenAi(options: {
    taskDescription: string;
    panelDimensions?: { width: number; height: number };
    theme?: string;
    theme_colors?: Record<string, string>;
    signal?: AbortSignal;
}): Promise<GenAiVisualizeResult> {
    const {
        taskDescription,
        panelDimensions = STUDY_COMPANION_VIZ_PANEL,
        theme = 'dark',
        theme_colors,
        signal,
    } = options;

    const response = await fetch('/api/genai/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            task_description: taskDescription,
            panel_dimensions: panelDimensions,
            theme,
            ...(theme_colors ? { theme_colors } : {}),
        }),
        signal,
    });

    if (!response.ok) {
        let message = 'Failed to generate visualization';
        try {
            const err = (await response.json()) as { error?: string; details?: string };
            if (typeof err.error === 'string') message = err.error;
            else if (typeof err.details === 'string') message = err.details;
        } catch {
            /* ignore */
        }
        throw new Error(message);
    }

    const data = (await response.json()) as Partial<GenAiVisualizeResult>;
    const library =
        data.library === 'p5' || data.library === 'three' || data.library === 'react' ? data.library : null;
    const code = typeof data.code === 'string' ? data.code : '';
    if (!library || !code.trim()) {
        throw new Error('Invalid visualization response');
    }
    return {
        explanation: typeof data.explanation === 'string' ? data.explanation : '',
        code,
        library,
    };
}
