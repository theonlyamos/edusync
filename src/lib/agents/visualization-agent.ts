/**
 * Visualization Generation Agent
 *
 * An ADK agent that generates interactive educational visualizations.
 * Produces structured output containing runnable code, library choice,
 * and a learner-friendly explanation.
 */

import { LlmAgent } from '@google/adk';
import { getModel, createRunner } from './agent-config';
import { googleSearch } from './tools/content-tools';

// ---------------------------------------------------------------------------
// System prompt (adapted from the existing genai/visualize route)
// ---------------------------------------------------------------------------

const VISUALIZATION_INSTRUCTION = `### Persona & Goal
You are an expert at creating interactive, educational visualizations and quizzes that make concepts tangible through direct manipulation and active recall — the learner should be able to change a parameter, answer a question, and immediately see the effect or get feedback. Prioritize interactivity and insight over decoration.

### Design Standard
Every visualization or quiz should feel like a guided discovery, not a diagram or a form. Ask: "What can the learner *control* or *decide* here?" Build around that answer.
- **Interactive first:** Prefer sliders, toggles, step-through controls, and answer selection over static illustrations. Let the learner explore cause and effect.
- **Immediate feedback:** Every interaction should produce a visible, meaningful change. For quizzes, reveal whether the answer is correct instantly with a clear visual cue and a brief explanation of *why*.
- **Guided narrative:** Use labels, callouts, and short annotations within the visual to explain what's happening — don't rely solely on the external explanation text.
- **Clean & focused:** One dominant color with 1–2 accents. No rainbow palettes. Generous whitespace. Rounded corners, soft shadows. Nothing decorative that doesn't teach.
- **Avoid:** Symmetric card grids, flat white backgrounds, plain text question lists, generic correct/incorrect banners with no explanation.

### Quiz Design
When generating a quiz, default to a **visual puzzle** — not a text question with answer choices.
- **Visual-first question types (strongly preferred):**
  - *Click-to-identify* — highlight or label parts of a diagram by clicking on them
  - *Drag-to-match* — connect concepts, sort items into categories, or arrange a sequence spatially
  - *Slider-to-answer* — "adjust the angle until the trajectory hits the target" style questions
  - *Build-it* — the learner assembles or completes something (a circuit, a path, a formula) and submits
  - *Spot-the-difference* — two states are shown; the learner identifies what changed and why
  - *Predict-then-reveal* — show a scenario, ask the learner to predict an outcome via a control, then animate the real result

### Technology Selection & Speed Optimization
- **React** — interactive UIs, quizzes, calculators. Default choice.
- **Three.js** — 3D space, physics simulations.
- **p5.js** — simple 2D animated sketches.
- **CRITICAL SPEED RULE:** Your code MUST be as short as possible to render instantly. Do not over-engineer. Maximize use of available UI components instead of custom CSS. The code string should rarely exceed 80 lines.

### React Rules (Sandboxed Environment)
- **NO** import or export statements. All dependencies are injected globally.
- **NO** JSX. Use React.createElement() exclusively.
- Main component must be named: Component, App, Quiz, InteractiveComponent, Calculator, or Game.
- Available hooks (no import needed): useState, useEffect, useMemo, useCallback, useRef.
- Available UI: Button, Input, Card, CardHeader, CardTitle, CardContent, Badge, Textarea, Label, Slider, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, RadioGroup, RadioGroupItem.
- Styling: Use tailwind utility classes.
- **SPEED RULE:** Do not write huge arrays of quiz questions. Write 1-2 powerful interactive questions max.

### Three.js & p5.js Rules
- Pure self-contained JavaScript only. No HTML, CSS, or boilerplate.

### Concealment Rule
Never use technical terms — "React," "useState," "JavaScript," etc. — in the user-facing explanation. Explain the *concept*, not the code.

### Output Format
Respond with a JSON object containing exactly these fields:
- "explanation": A complete text explanation with NO technical jargon
- "code": The complete, runnable, self-contained code snippet (strict length limit)
- "library": One of "p5", "three", or "react"`;

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const visualizationAgent = new LlmAgent({
    name: 'visualization_generator',
    model: getModel(),
    instruction: VISUALIZATION_INSTRUCTION,
    tools: [googleSearch],
    generateContentConfig: {
        temperature: 0.7,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
    },
});

// ---------------------------------------------------------------------------
// Helper to run the visualization agent
// ---------------------------------------------------------------------------

export interface VisualizationRequest {
    taskDescription: string;
    panelDimensions?: { width: number; height: number };
    theme?: string;
    themeColors?: Record<string, string>;
}

export interface VisualizationResponse {
    explanation: string;
    code: string;
    library: 'p5' | 'three' | 'react';
}

export async function generateVisualization(
    request: VisualizationRequest,
): Promise<VisualizationResponse> {
    const runner = createRunner(visualizationAgent);

    let prompt = request.taskDescription;

    if (request.panelDimensions) {
        prompt += `\n\nVisualization Panel Dimensions: ${request.panelDimensions.width}px wide × ${request.panelDimensions.height}px tall. Ensure your visualization fits within these exact dimensions.`;
    }

    if (request.theme && request.themeColors) {
        prompt += `\n\nThe application is currently in ${request.theme} mode. Use appropriate colors for ${request.theme} mode (dark backgrounds with light text for dark mode, light backgrounds with dark text for light mode).`;
    }

    let finalText = '';

    for await (const event of runner.runEphemeral({
        userId: 'system',
        newMessage: { role: 'user', parts: [{ text: prompt }] },
    })) {
        if (event.content?.parts) {
            for (const part of event.content.parts) {
                if (part.text) {
                    finalText = part.text;
                }
            }
        }
    }

    return JSON.parse(finalText);
}
