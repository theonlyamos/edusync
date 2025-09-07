import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const displayVisualAidFunctionDeclaration = {
    name: 'display_visual_aid',
    description: "Call this function to display a visual illustration to the student. The AI must generate the explanation, code, and library name itself before calling this function.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            explanation: {
                type: Type.STRING,
                description: "The complete text explanation that will accompany the code."
            },
            code: {
                type: Type.STRING,
                description: "The complete, runnable code snippet for the chosen library (p5.js, Three.js, or React). Do not add any comments to the code. Add proper line breaks to the code."
            },
            library: {
                type: Type.STRING,
                description: "The name of the library used for the code. Must be one of 'p5', 'three', or 'react'."
            }
        },
        required: ['explanation', 'code', 'library']
    }
};

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY environment variable not set' },
                { status: 500 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        const { task_description } = await request.json();

        if (!task_description) {
            return NextResponse.json(
                { error: 'task_description is required' },
                { status: 400 }
            );
        }

        const systemPrompt = `You are an expert in creating educational visualizations. Your task is to generate code and explanations for visual aids based on a given task description.

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
* **CRITICAL:** Your main component function must be named exactly one of these: \`Component\`, \`App\`, \`Quiz\`, \`InteractiveComponent\`, \`Calculator\`, or \`Game\`. Do not use any other names like \`Introduction\`, \`Demo\`, etc.
* **MOST IMPORTANT:** You **MUST** use \`React.createElement()\` syntax. **NEVER** use JSX tags (e.g., \`<Card>\`).

* Prefer small, robust examples that run instantly.

### Flashcard Generation (React)

* Use the \`'react'\` library with \`React.createElement()\` (no JSX).
* Represent the deck as an in-component array of objects like: \`[{ front: string, back: string }]\`.
* Include controls using allowed UI components: \`Button\`, \`Card\`, \`CardHeader\`, \`CardTitle\`, \`CardContent\`.
* Provide basic interactions: Flip, Next/Previous, and Shuffle/Restart.
* Keep state minimal (e.g., \`currentIndex\`, \`isFlipped\`); handle bounds and empty decks gracefully.
* Name the main component \`App\` or \`InteractiveComponent\` to comply with naming rules.

* **\`React.createElement()\` Example with correct naming:**
   \`\`\`javascript
   function App() {
     const [currentQuestion, setCurrentQuestion] = useState(0);

     return React.createElement(Card, null,
       React.createElement(CardHeader, null,
         React.createElement(CardTitle, null, "Introduction to Economics")
       ),
       React.createElement(CardContent, null,
         React.createElement('p', null, 'Economics is the study of resource allocation...')
       )
     );
   }
   \`\`\`

YOUR RESPONSE SHOULD ALWAYS INCLUDE A FUNCTION CALL TO display_visual_aid.
   `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: task_description,
            config: {
                systemInstruction: systemPrompt,
                tools: [{
                    functionDeclarations: [displayVisualAidFunctionDeclaration]
                }],
            },
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
            const functionCall = response.functionCalls[0];
            return NextResponse.json(functionCall.args);
        } else {
            return NextResponse.json(
                { error: 'No function call found in the response.' },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Failed to generate visualization:', error);
        return NextResponse.json(
            { error: 'Failed to generate visualization', details: error.message },
            { status: 500 }
        );
    }
}
