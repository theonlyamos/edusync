import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context'
import OpenAI from 'openai';
import { rateLimit } from '@/lib/rate-limiter';
import { convertImageUrlsToBase64 } from '@/lib/imageUtils.server';

interface OpenAIConfig {
    baseURL: string;
    apiKey: string;
    defaultHeaders?: Record<string, string>;
}

const AI_PROVIDER = process.env.AI_PROVIDER || 'GEMINI';
const PROVIDER_BASE_URL = process.env[`${AI_PROVIDER}_BASE_URL`] || '';
const PROVIDER_API_KEY = process.env[`${AI_PROVIDER}_API_KEY`];
const PROVIDER_MODEL = process.env[`${AI_PROVIDER}_MODEL`];
let HELICONE_BASE_URL = process.env.HELICONE_BASE_URL || '';
const HELICONE_API_KEY = process.env.HELICONE_API_KEY;

if (AI_PROVIDER === 'GEMINI') {
    HELICONE_BASE_URL = HELICONE_BASE_URL + 'beta';
}

const openaiConfig: OpenAIConfig = {
    baseURL: AI_PROVIDER === 'GROQ' ? PROVIDER_BASE_URL : HELICONE_BASE_URL,
    apiKey: PROVIDER_API_KEY || '',
};

if (AI_PROVIDER !== 'GROQ') {
    openaiConfig.defaultHeaders = {
        "Helicone-Auth": `Bearer ${HELICONE_API_KEY}`,
        "Helicone-Target-Url": PROVIDER_BASE_URL,
        "Helicone-Target-Provider": AI_PROVIDER,
    };
}

const openai = new OpenAI(openaiConfig);

const SYSTEM_PROMPT = `### Persona & Goal
You are an expert at creating interactive, educational visualizations and quizzes that make concepts tangible through direct manipulation and active recall — the learner should be able to change a parameter, answer a question, and immediately see the effect or get feedback. Prioritize interactivity and insight over decoration.

### Design Standard
Every visualization or quiz should feel like a guided discovery, not a diagram or a form. Ask: "What can the learner *control* or *decide* here?" Build around that answer.
- **Interactive first:** Prefer sliders, toggles, step-through controls, and answer selection over static illustrations. Let the learner explore cause and effect.
- **Immediate feedback:** Every interaction should produce a visible, meaningful change. For quizzes, reveal whether the answer is correct instantly with a clear visual cue and a brief explanation of *why*.
- **Guided narrative:** Use labels, callouts, and short annotations within the visual to explain what's happening — don't rely solely on the external explanation text.
- **Clean & focused:** One dominant color with 1–2 accents. No rainbow palettes. Generous whitespace. Rounded corners, soft shadows. Nothing decorative that doesn't teach.
- **Avoid:** Symmetric card grids, flat white backgrounds, plain text question lists, generic correct/incorrect banners with no explanation.

### Quiz Design
When generating a quiz, default to a **visual puzzle** — not a text question with answer choices. The learner should interact with the visual itself to answer.

- **Visual-first question types (strongly preferred):**
  - *Click-to-identify* — highlight or label parts of a diagram by clicking on them
  - *Drag-to-match* — connect concepts, sort items into categories, or arrange a sequence spatially
  - *Slider-to-answer* — "adjust the angle until the trajectory hits the target" style questions
  - *Build-it* — the learner assembles or completes something (a circuit, a path, a formula) and submits
  - *Spot-the-difference* — two states are shown; the learner identifies what changed and why
  - *Predict-then-reveal* — show a scenario, ask the learner to predict an outcome by interacting with a control, then animate the real result

- **Text question types (minimal, last resort):**
  - Only use multiple choice or numeric input when the concept genuinely cannot be expressed visually.
  - If text options are unavoidable, render them as large clickable cards — never radio buttons or dropdowns.
  - Keep question text to one sentence. No lengthy preambles.

- **Feedback:** Always reveal feedback inline within the visual itself — animate the correct state, highlight the right element, or show the predicted vs. actual outcome. Avoid generic "Correct!" banners.
- **One puzzle at a time** with a minimal progress indicator (e.g. "2 / 4") and a clean end screen with score and "Try Again."
- **Answer states:** Correct answers highlight in green; incorrect selections in red with the correct answer also revealed in green. Unselected options dim after submission.
- **Do NOT use the built-in \`Quiz\` component.** Always generate quiz UI from scratch using primitive components and inline styles.

### Technology Selection
- **React** — interactive UIs, quizzes, calculators, charts (Recharts), maps (React-Leaflet). Default choice.
- **Three.js** — 3D space, physics simulations, orbital mechanics, molecular structures.
- **p5.js** — simple 2D animated sketches where a canvas loop is the most natural fit.

### Sizing
Subtract 96px from provided width and height for your canvas or root element to prevent overflow.

### React Rules (Sandboxed Environment)
- **NO** \`import\` or \`export\` statements. All dependencies are injected globally.
- **NO** JSX. Use \`React.createElement()\` exclusively.
- Main component must be named: Component, App, Quiz, InteractiveComponent, Calculator, or Game.
- Available hooks (no import needed): useState, useEffect, useMemo, useCallback, useRef.
- Available UI: Button, Input, Card, CardHeader, CardTitle, CardContent, Badge, Textarea, Label, Slider, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, RadioGroup, RadioGroupItem.
- Available charts (Recharts): LineChart, BarChart, PieChart, AreaChart, ScatterChart, RadarChart, and all standard sub-components.
- Available maps (React-Leaflet): MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, Circle, useMap.
- Styling: Tailwind utility classes for standard styles; inline \`style\` props for gradients and dynamic values. No \`@import \`, no CSS variables.
- Images: Use \`React.createElement('img', { src, alt, style })\`. Extract URLs from markdown syntax in the task description.

### Three.js & p5.js Rules
- Pure self-contained JavaScript only. No HTML, CSS, or boilerplate.
- Images: p5.js → \`loadImage()\` / \`image()\`; Three.js → \`THREE.TextureLoader\`.

### Concealment Rule
Never use technical terms — "React," "useState," "JavaScript," etc. — in the user-facing explanation. Explain the *concept*, not the code.

### Output
Respond with a single \`display_visual_aid\` function call containing \`code\`, \`library\`, and \`explanation\`.`;

const displayVisualAidFunctionDeclaration = {
    type: 'function' as const,
    function: {
        name: 'display_visual_aid',
        description: "Generates and displays a complete visual aid for the student. This is the final step and should contain the generated code, the library used, and a user-friendly explanation of the concept.",
        parameters: {
            type: 'object',
            properties: {
                explanation: {
                    type: 'string',
                    description: "The complete text explanation that will accompany the visual. This explanation must be easy to understand and contain NO technical jargon (e.g., 'React', 'useState', 'JavaScript')."
                },
                code: {
                    type: 'string',
                    description: "The complete, runnable, and self-contained code snippet. It must not contain any comments. For React, the code MUST use `React.createElement()` syntax and never JSX."
                },
                library: {
                    type: 'string',
                    description: "The specific library used to write the code.",
                    enum: ['p5', 'three', 'react']
                }
            },
            required: ['explanation', 'code', 'library']
        }
    }
};


export async function POST(request: NextRequest) {
    try {
        const authContext = getAuthContext(request);
        if (!authContext) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const rateLimitResponse = await rateLimit(request, 'api');
        if (rateLimitResponse) return rateLimitResponse;

        const body = await request.json();

        const { task_description, panel_dimensions, theme, theme_colors } = body;

        if (!task_description) {
            return NextResponse.json(
                { error: 'task_description is required' },
                { status: 400 }
            );
        }

        const dimensionsInfo = panel_dimensions
            ? `\n\nVisualization Panel Dimensions: ${panel_dimensions.width}px wide × ${panel_dimensions.height}px tall\nEnsure your visualization fits within these exact dimensions.`
            : '';

        const themeInfo = theme && theme_colors
            ? `\n\n**CRITICAL: Color Theme Requirements**
The application is currently in ${theme} mode. You MUST use Tailwind CSS classes that match the theme colors to ensure perfect visual harmony and readability.

**Theme Color Mapping (${theme} mode):**
Since components run in a sandboxed environment, use Tailwind CSS utility classes that approximate the theme colors:

- **Background:** Use 'bg-white' for light mode or 'bg-gray-900'/'bg-slate-900' for dark mode for canvas/container backgrounds
- **Foreground/Text:** Use 'text-gray-900' for light mode or 'text-gray-100'/'text-white' for dark mode for all body text and labels
- **Primary:** Use 'bg-blue-600' with 'text-white' for primary buttons and key interactive elements (or 'bg-blue-500'/'bg-blue-700' for variations)
- **Secondary:** Use 'bg-gray-200' with 'text-gray-900' for light mode, or 'bg-gray-700' with 'text-gray-100' for dark mode for secondary actions
- **Accent:** Use 'bg-blue-500', 'bg-purple-500', or 'bg-indigo-500' sparingly for highlights and emphasis
- **Muted:** Use 'bg-gray-100' with 'text-gray-600' for light mode, or 'bg-gray-800' with 'text-gray-400' for dark mode for less prominent text and subtle backgrounds
- **Border:** Use 'border-gray-300' for light mode or 'border-gray-700' for dark mode for dividers and borders

**MANDATORY RULES:**
1. ALL text must use appropriate text color classes ('text-gray-900', 'text-gray-600', 'text-white', 'text-gray-100', etc.) based on the theme
2. ALL buttons must use appropriate background and text color classes (e.g., 'bg-blue-600 text-white' for primary, 'bg-gray-200 text-gray-900' for secondary)
3. ALL backgrounds must use appropriate background classes ('bg-white', 'bg-gray-100', 'bg-gray-900', 'bg-gray-800', etc.) based on the theme
4. Use Tailwind CSS utility classes - do NOT use CSS variables or inline color values
5. For charts/graphs, use Tailwind color classes that match the theme (blue, indigo, purple shades for primary/accent, gray shades for neutral)
6. Ensure all text has sufficient contrast against its background (use darker text on lighter backgrounds and lighter text on darker backgrounds)
7. When in doubt, use the standard Tailwind color palette with appropriate shades for ${theme} mode`
            : '';

        const systemPromptWithDimensions = SYSTEM_PROMPT + dimensionsInfo + themeInfo;

        const completion = await openai.chat.completions.create({
            model: PROVIDER_MODEL as string,
            messages: [
                { role: 'system', content: systemPromptWithDimensions },
                { role: 'user', content: task_description }
            ],
            tools: [displayVisualAidFunctionDeclaration],
            temperature: 0.7,
            max_tokens: 16384,
        });

        const message = completion.choices?.[0]?.message as any;

        if (message?.tool_calls && message.tool_calls.length > 0) {
            const toolCall: any = message.tool_calls.find((t: any) => t.type === 'function' && t.function?.name === 'display_visual_aid')
                ?? message.tool_calls.find((t: any) => t.type === 'function')
                ?? message.tool_calls[0];
            try {
                const args = JSON.parse(toolCall?.function?.arguments || '{}');

                // Convert image URLs to base64 server-side to bypass CSP restrictions
                if (args.code) {
                    args.code = await convertImageUrlsToBase64(args.code);
                }

                return NextResponse.json(args);
            } catch {
                return NextResponse.json({ error: 'Tool call arguments were not valid JSON.' }, { status: 500 });
            }
        }

        try {
            const result = JSON.parse(message?.content || '{}');

            // Convert image URLs to base64 server-side to bypass CSP restrictions
            if (result.code) {
                result.code = await convertImageUrlsToBase64(result.code);
            }

            return NextResponse.json({ ...result, _source: 'content' });
        } catch {
            return NextResponse.json({ error: 'AI response was not valid JSON.' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('Failed to generate visualization:', error);
        return NextResponse.json(
            { error: 'Failed to generate visualization', details: error.message },
            { status: 500 }
        );
    }
}
