import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    baseURL: process.env.CEREBRAS_BASE_URL,
    apiKey: process.env.CEREBRAS_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert in creating educational visualizations. Your task is to generate code and explanations for visual aids based on a given task description.

### Design and Aesthetics

* Aim for modern UI aesthetics: clean layout, ample spacing, readable typography, rounded corners, subtle shadows, and soft gradients.
* Use a muted neutral background with a single accent color; maintain accessible contrast.
* Prefer centered, responsive layouts with generous padding and consistent gaps.
* Keep visuals self-contained and lightweight; avoid heavy borders and excessive animation.
* Use only the allowed UI components (e.g., \`Card\`, \`CardHeader\`, \`CardTitle\`, \`CardContent\`, \`Button\`, \`Badge\`) to compose modern-looking sections.

### Panel Dimensions

* The visualization will be displayed in a panel with specific dimensions that will be provided.
* Your visualization must either fit exactly within these dimensions OR be fully responsive.
* For p5.js and Three.js: Use the provided width and height to set up your canvas size exactly, or make it responsive with percentage-based sizing.
* For React components: Either design fixed layouts that fit the exact dimensions, or create responsive layouts using CSS that adapt to the container.
* Consider leaving some padding/margin to ensure the content doesn't touch the edges.
* Responsive visualizations should use CSS techniques like flexbox, grid, or percentage-based widths/heights to adapt to different screen sizes.

### Chart and Data Visualization

* You can generate interactive charts and data visualizations using React and Recharts components.
* Charts are excellent for explaining mathematical concepts, statistical data, scientific relationships, economic principles, and trends.
* Consider using charts when the concept involves data, comparisons, trends, distributions, or quantitative relationships.
* Make charts interactive when possible - allow users to explore data, toggle series, or modify parameters.
* Always provide meaningful data that illustrates the educational concept being taught.

### Topic Introduction

* When a new topic is being introduced, always generate an introductory visualization that covers the fundamentals.
* For introductory content, focus on fundamental concepts, basic definitions, and overview-style visualizations.
* Make introductory visualizations approachable and foundational, avoiding complex details.
* Use simple, clear examples that establish the core understanding of the topic.
* Title and structure the content naturally - it doesn't need to follow a specific format.

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
* Use modern React with hooks. The hooks \`useState\`, \`useEffect\`, \`useMemo\`, and \`useCallback\` are available directly. Do not import them.
* Use only the following available UI components: \`Button\`, \`Input\`, \`Card\`, \`CardContent\`, \`CardHeader\`, \`CardTitle\`, \`Badge\`, \`Textarea\`, \`Label\`, \`RadioGroup\`, \`RadioGroupItem\`, \`Checkbox\`, \`Select\`, \`SelectContent\`, \`SelectItem\`, \`SelectTrigger\`, \`SelectValue\`, \`Slider\`.
* For charts and data visualization, you can use Recharts components: \`LineChart\`, \`BarChart\`, \`PieChart\`, \`AreaChart\`, \`ScatterChart\`, \`RadarChart\`, \`XAxis\`, \`YAxis\`, \`CartesianGrid\`, \`Tooltip\`, \`Legend\`, \`ResponsiveContainer\`, \`Line\`, \`Bar\`, \`Area\`, \`Pie\`, \`Cell\`, \`Scatter\`, \`RadialBar\`, \`RadialBarChart\`.
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

### Map Generation (React)
* Display the map when discussing geographical topics.
* Use the \`'react'\` library with \`React.createElement()\` (no JSX).
* Use the \`@googlemaps/js-api-loader\` library to generate a map.
* The \`Loader\` component is already imported. Do not import it again.
* Use \`process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\` as the API key for the loader.
* Name the main component \`App\` or \`InteractiveComponent\` to comply with naming rules.
* **CRITICAL:** You **MUST** use \`React.createElement()\` syntax. **NEVER** use JSX tags (e.g., \`<Card>\`).

### Example react code
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

const displayVisualAidFunctionDeclaration = {
    type: 'function' as const,
    function: {
        name: 'display_visual_aid',
        description: "Call this function to display a visual illustration to the student. The AI must generate the explanation, code, and library name itself before calling this function.",
        parameters: {
            type: 'object',
            properties: {
                explanation: {
                    type: 'string',
                    description: "The complete text explanation that will accompany the code."
                },
                code: {
                    type: 'string',
                    description: "The complete, runnable code snippet for the chosen library (p5.js, Three.js, or React). Do not add any comments to the code. Add proper line breaks to the code."
                },
                library: {
                    type: 'string',
                    description: "The name of the library used for the code. Must be one of 'p5', 'three', or 'react'."
                }
            },
            required: ['explanation', 'code', 'library']
        }
    }
};

export async function POST(request: NextRequest) {
    try {

        const { task_description, panel_dimensions } = await request.json();

        if (!task_description) {
            return NextResponse.json(
                { error: 'task_description is required' },
                { status: 400 }
            );
        }

        const dimensionsInfo = panel_dimensions
            ? `\n\nVisualization Panel Dimensions: ${panel_dimensions.width}px wide × ${panel_dimensions.height}px tall\nEnsure your visualization fits within these exact dimensions.`
            : '';

        const systemPromptWithDimensions = SYSTEM_PROMPT + dimensionsInfo;

        const completion = await openai.chat.completions.create({
            model: process.env.CEREBRAS_MODEL as string,
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
                return NextResponse.json(args);
            } catch {
                return NextResponse.json({ error: 'Tool call arguments were not valid JSON.' }, { status: 500 });
            }
        }

        try {
            const result = JSON.parse(message?.content || '{}');
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
