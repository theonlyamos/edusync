import { useReducer, useCallback } from 'react';

/**
 * Shared visualization state reducer for AI Tutor components
 * Provides atomic state updates to reduce re-renders
 */

export type Visualization = {
    id?: string;
    code: string;
    library: 'p5' | 'three' | 'react';
    explanation?: string;
    taskDescription?: string;
    panelDimensions?: { width: number; height: number };
};

export type VizState = {
    code: string;
    library: 'p5' | 'three' | 'react' | null;
    visualizations: Visualization[];
    currentVizIndex: number;
    generatingVisualization: boolean;
};

export type VizAction =
    | { type: 'SET_CODE'; payload: string }
    | { type: 'SET_LIBRARY'; payload: 'p5' | 'three' | 'react' | null }
    | { type: 'ADD_VISUALIZATION'; payload: Visualization }
    | { type: 'UPDATE_VISUALIZATION'; index: number; payload: Partial<Visualization> }
    | { type: 'SET_CURRENT_VIZ_INDEX'; payload: number }
    | { type: 'SET_GENERATING'; payload: boolean }
    | { type: 'SET_CURRENT_VIZ'; payload: { code: string; library: 'p5' | 'three' | 'react'; index: number } }
    | { type: 'LOAD_VISUALIZATIONS'; payload: Visualization[] }
    | { type: 'RESET' };

export const vizReducer = (state: VizState, action: VizAction): VizState => {
    switch (action.type) {
        case 'SET_CODE':
            return { ...state, code: action.payload };
        case 'SET_LIBRARY':
            return { ...state, library: action.payload };
        case 'ADD_VISUALIZATION':
            return {
                ...state,
                visualizations: [...state.visualizations, action.payload],
                currentVizIndex: state.visualizations.length,
                code: action.payload.code,
                library: action.payload.library,
            };
        case 'UPDATE_VISUALIZATION':
            const updated = [...state.visualizations];
            updated[action.index] = { ...updated[action.index], ...action.payload };
            return { ...state, visualizations: updated };
        case 'SET_CURRENT_VIZ_INDEX':
            const viz = state.visualizations[action.payload];
            if (viz) {
                return { ...state, currentVizIndex: action.payload, code: viz.code, library: viz.library };
            }
            return { ...state, currentVizIndex: action.payload };
        case 'SET_GENERATING':
            return { ...state, generatingVisualization: action.payload };
        case 'SET_CURRENT_VIZ':
            return {
                ...state,
                code: action.payload.code,
                library: action.payload.library,
                currentVizIndex: action.payload.index,
            };
        case 'LOAD_VISUALIZATIONS':
            if (action.payload.length > 0) {
                return {
                    ...state,
                    visualizations: action.payload,
                    currentVizIndex: 0,
                    code: action.payload[0].code,
                    library: action.payload[0].library,
                };
            }
            return { ...state, visualizations: action.payload };
        case 'RESET':
            return { code: '', library: null, visualizations: [], currentVizIndex: -1, generatingVisualization: false };
        default:
            return state;
    }
};

export const initialVizState: VizState = {
    code: '',
    library: null,
    visualizations: [],
    currentVizIndex: -1,
    generatingVisualization: false,
};

/**
 * Custom hook for visualization state management
 * Returns state, dispatch, and convenience setter functions
 */
export function useVisualizationState() {
    const [vizState, vizDispatch] = useReducer(vizReducer, initialVizState);

    const setCode = useCallback((newCode: string) => vizDispatch({ type: 'SET_CODE', payload: newCode }), []);
    const setLibrary = useCallback((newLib: 'p5' | 'three' | 'react' | null) => vizDispatch({ type: 'SET_LIBRARY', payload: newLib }), []);
    const setCurrentVizIndex = useCallback((index: number) => vizDispatch({ type: 'SET_CURRENT_VIZ_INDEX', payload: index }), []);
    const setGeneratingVisualization = useCallback((val: boolean) => vizDispatch({ type: 'SET_GENERATING', payload: val }), []);

    return {
        vizState,
        vizDispatch,
        setCode,
        setLibrary,
        setCurrentVizIndex,
        setGeneratingVisualization,
    };
}
