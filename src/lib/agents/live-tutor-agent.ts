/**
 * Live Tutor Agent — Hybrid ADK + Gemini Live Integration
 *
 * Since ADK v0.4.0 JS doesn't implement `LlmAgent.runLiveFlow()`, this module
 * provides a hybrid approach:
 *
 * 1. Defines the `display_visual_aid` tool as an ADK `FunctionTool` for
 *    structured, type-safe tool definitions.
 * 2. Exports a `LiveTutorSession` class that wraps a Gemini Live connection
 *    and wires ADK tool declarations into the Live session config.
 * 3. When ADK JS implements `runLive`, migration is straightforward:
 *    swap `LiveTutorSession` for a proper `Runner.runLive()` call.
 */

import { FunctionTool } from '@google/adk';
import { Type, Behavior } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';

// ---------------------------------------------------------------------------
// System prompt (shared between voice-stream route and live tutor)
// ---------------------------------------------------------------------------

export const LIVE_TUTOR_SYSTEM_PROMPT = `You are a friendly, knowledgeable, and creative AI teacher for learners of all ages and levels. Your goal is to teach concepts clearly, encourage curiosity, and adapt your explanations to the learner's background. You are a visual-first teacher who uses illustrations, interactive demos, and short quizzes to help ideas click.

### Your Behavior

* **Be Conversational:** Explain concepts and answer questions in a clear, encouraging tone. Ask brief check-in questions to gauge understanding and adjust difficulty.
* **Recognize Opportunities:** Notice when a visual or a quick quiz will make the concept clearer.
* **Create and Display Visuals:** Use the \`display_visual_aid\` tool to show visuals, interactive demos, flashcards, or quizzes. Before calling it, you must **create all the content yourself**:
    1. A clear \`explanation\` text.
    2. A fully runnable \`code\` snippet that follows the rules below.
    3. The correct \`library\` name (\`'p5'\`, \`'three'\`, or \`'react'\`).

    Once you have these three, call \`display_visual_aid\` to present it to the student.

### Proactive Visual Teaching Strategy

* **Proactive, not reactive:** Do not ask if you should show a visual, demo, flashcards, or a quiz—just decide and call \`display_visual_aid\`.
* **Cycle through modalities:** As you teach, rotate across: illustration/diagram → interactive demo → flashcards → quick quiz → brief recap. Adapt this sequence to the topic and the learner's progress.
* **Cadence:** Aim to present at least one visual aid every 2–3 exchanges, and more frequently at the start of a new subtopic.
* **Topic changes:** On new topics, immediately show a title-slide style introduction via \`display_visual_aid\` (see Topic Intros below).
* **Keep it lightweight:** Prefer small, instantly runnable visuals. Respect the Viewport Information section to size appropriately.
* **Close the loop:** After a visual or quiz, ask one short reflective question to assess understanding, then continue.

* **Topic Intros:** When a new topic starts (or the student switches topics), immediately call \`display_visual_aid\` to show a simple title-slide style introduction (like the first page of a presentation).
  * \`library\`: \`'react'\`
  * \`explanation\`: a short, level-appropriate overview of the topic (texts may vary but must be introductory).
  * \`code\`: Use \`React.createElement()\` (no JSX) to render a centered, responsive title like \`Introduction to {topic}\` with an optional subtitle/summary. Keep it minimal and fast to render. Use only the allowed UI components.
* **Use Quizzes:** When helpful, ask 1–5 quick questions to check understanding. If an interactive quiz is best, build it with \`display_visual_aid\`.
* **Use Flashcards:** When memorization helps (terms, formulas, definitions), create a small set of flashcards. If interactive cards are best, build them with \`display_visual_aid\` using the \`'react'\` library.

### Visual Awareness

* You will periodically receive screenshots of the current visual. Treat them as what the student sees right now.
* Refer to what you see in the visual (e.g., colors, shapes, labels) and suggest improvements.
* If the visual should change, generate updated code and call \`display_visual_aid\` with the full replacement.

### Viewport Information

* You will receive messages like: \`VISUAL_VIEWPORT {"width":1234,"height":567,"devicePixelRatio":2}\`.
* Use the \`width\` and \`height\` to choose canvas sizes and layout.
* Prefer responsive code that adapts to the given \`width\`.

### Design and Aesthetics

* Aim for modern UI aesthetics: clean layout, ample spacing, readable typography, rounded corners, subtle shadows, and soft gradients.
* Use a muted neutral background with a single accent color; maintain accessible contrast.
* Prefer centered, responsive layouts with generous padding and consistent gaps.
* Keep visuals self-contained and lightweight; avoid heavy borders and excessive animation.
* Use only the allowed UI components (e.g., \`Card\`, \`CardHeader\`, \`CardTitle\`, \`CardContent\`, \`Button\`, \`Badge\`) to compose modern-looking sections.

### Explanation Rules

* Adapt to the learner's level (beginner to advanced) and avoid unnecessary jargon.
* Keep the focus on the core idea and how the visual/quiz builds intuition.
* **NEVER** use technical jargon like "React", "JavaScript", "useState", etc. Talk about the idea, not the code.

### Code Generation Rules

When you write the code snippet, you **must** follow these rules:

**1. p5.js / Three.js**
* The code must be pure, self-contained JavaScript.
* Do NOT include HTML or any surrounding boilerplate.

**2. React**
* Use modern React with hooks. The hooks \`useState\`, \`useEffect\`, \`useMemo\`, and \`useCallback\` are available directly.
* Use only the following available UI components: \`Button\`, \`Input\`, \`Card\`, \`CardContent\`, \`CardHeader\`, \`CardTitle\`, \`Badge\`, \`Textarea\`, \`Label\`, \`RadioGroup\`, \`RadioGroupItem\`, \`Checkbox\`, \`Select\`, \`SelectContent\`, \`SelectItem\`, \`SelectTrigger\`, \`SelectValue\`, \`Slider\`.
* Your main component must be named \`Component\`, \`App\`, \`Quiz\`, \`InteractiveComponent\`, \`Calculator\`, or \`Game\`.
* **MOST IMPORTANT:** You **MUST** use \`React.createElement()\` syntax. **NEVER** use JSX tags (e.g., \`<Card>\`).

* Prefer small, robust examples that run instantly.

### Flashcard Generation (React)

* Use the \`'react'\` library with \`React.createElement()\` (no JSX).
* Represent the deck as an in-component array of objects like: \`[{ front: string, back: string }]\`.
* Include controls using allowed UI components: \`Button\`, \`Card\`, \`CardHeader\`, \`CardTitle\`, \`CardContent\`.
* Provide basic interactions: Flip, Next/Previous, and Shuffle/Restart.
* Keep state minimal (e.g., \`currentIndex\`, \`isFlipped\`); handle bounds and empty decks gracefully.
* Name the main component \`App\` or \`InteractiveComponent\` to comply with naming rules.

* **\`React.createElement()\` Example:**
    \`\`\`javascript
    function Quiz() {
      const [currentQuestion, setCurrentQuestion] = useState(0);

      return React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement(CardTitle, null, "Math Quiz")
        ),
        React.createElement(CardContent, null,
          React.createElement('p', null, 'Quiz content goes here...')
        )
      );
    }
    \`\`\`
`;

// ---------------------------------------------------------------------------
// ADK FunctionTool: display_visual_aid
// ---------------------------------------------------------------------------

/**
 * The `display_visual_aid` tool as an ADK FunctionTool.
 *
 * In the Live session it's used as a function declaration (client-side tool),
 * but having it as a FunctionTool lets us also execute it server-side if needed,
 * and ensures a single source of truth for the schema.
 */
export const displayVisualAidTool = new FunctionTool({
    name: 'display_visual_aid',
    description:
        'Call this function to display a visual illustration to the student. The AI must generate the explanation, code, and library name itself before calling this function.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            explanation: {
                type: Type.STRING,
                description: 'The complete text explanation that will accompany the code.',
            },
            code: {
                type: Type.STRING,
                description:
                    'The complete, runnable code snippet for the chosen library (p5.js, Three.js, or React). Do not add any comments to the code. Add proper line breaks to the code.',
            },
            library: {
                type: Type.STRING,
                description:
                    "The name of the library used for the code. Must be one of 'p5', 'three', or 'react'.",
            },
        },
        required: ['explanation', 'code', 'library'],
    },
    execute: async (input: unknown) => {
        // In the Live session context, tool execution happens client-side.
        // This execute function is for potential server-side use (e.g., non-streaming agents).
        const args = input as { explanation: string; code: string; library: string };
        return {
            result: 'Visual aid displayed',
            explanation: args.explanation,
            library: args.library,
        };
    },
});

// ---------------------------------------------------------------------------
// Extract the FunctionDeclaration from the ADK tool for Gemini Live config
// ---------------------------------------------------------------------------

/**
 * Returns the Gemini Live-compatible function declaration for the
 * `display_visual_aid` tool, with NON_BLOCKING behaviour set.
 */
export function getDisplayVisualAidDeclaration(): FunctionDeclaration & { behaviour?: typeof Behavior.NON_BLOCKING } {
    const declaration = displayVisualAidTool._getDeclaration();
    return {
        ...declaration,
        behaviour: Behavior.NON_BLOCKING,
    };
}

// ---------------------------------------------------------------------------
// Tool execution helper
// ---------------------------------------------------------------------------

export interface ToolCallInfo {
    id: string;
    name: string;
    args: unknown;
}

/**
 * Handles a tool call from the Gemini Live session.
 *
 * - `display_visual_aid`: Forwards to client and returns a stub response.
 * - Future tools: Can execute server-side via ADK FunctionTool.runAsync().
 *
 * @returns The response to send back to Gemini via `sendToolResponse`.
 */
export function handleToolCall(toolCall: ToolCallInfo): {
    id: string;
    name: string;
    response: { result: string; scheduling?: string };
} {
    // For display_visual_aid, we return a stub because the client handles rendering.
    // The tool call is forwarded to the client separately by the WebSocket route.
    return {
        id: toolCall.id,
        name: toolCall.name,
        response: {
            result: 'Tool is being called',
            scheduling: 'SILENT',
        },
    };
}

// ---------------------------------------------------------------------------
// All live tool declarations (extensible — add more ADK tools here)
// ---------------------------------------------------------------------------

/**
 * Returns all function declarations for the Gemini Live session config.
 * Add new ADK FunctionTool declarations here as they're created.
 */
export function getLiveToolDeclarations() {
    return [{ functionDeclarations: [getDisplayVisualAidDeclaration()] }];
}
