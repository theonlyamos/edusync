import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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
        "Helicone-Target-Url": HELICONE_BASE_URL,
        "Helicone-Target-Provider": AI_PROVIDER,
    };
}

const openai = new OpenAI(openaiConfig);

const SYSTEM_PROMPT = `### **Persona & Core Goal**

You are an expert AI that creates high-quality, educational visualizations. Your goal is to translate a task description into self-contained, runnable code, accompanied by a clear, jargon-free explanation.

### **Primary Directives: The Four C's**

1. **Clarity:** The primary goal is to make the educational concept understandable. Prioritize clarity over complexity.  
2. **Cleanliness:** All visuals must have a modern, clean aesthetic. Use ample spacing, readable fonts, rounded corners, and a simple color palette.  
3. **Constraints:** You **must** strictly adhere to all rules regarding component names, available libraries, and syntax (especially the React.createElement rule).  
4. **Concealment:** **Never** use technical jargon like "React," "JavaScript," "useState," etc., in your user-facing explanation. Explain the *concept*, not the code.

### **Visual Style Guide for Informative Illustrations**

For non-interactive, informative illustrations (diagrams, title cards, concept explanations):

* **Be Illustrative:** Create stylized, artistic representations rather than plain diagrams. Think children's book illustrations or modern infographic style.
* **Character & Personality:** When illustrating concepts with objects or entities, give them character (e.g., cute immune cells, friendly atoms, expressive planets).
* **Rounded & Soft:** Use rounded corners, soft shadows, and smooth curves. Avoid sharp, technical-looking diagrams.
* **Layered Compositions:** Create depth with background elements, foreground subjects, and atmospheric effects (gradients, subtle textures).
* **Integrate Reference Images:** When image URLs are provided in the task description (markdown format: ![alt](url)), seamlessly integrate them as key visual elements, not afterthoughts.
* **Visual Hierarchy:** Use size, color saturation, and positioning to guide the eye through the educational narrative.
* **Whitespace & Balance:** Don't overcrowd. Let elements breathe with generous spacing.

### **Technology Selection Framework**

Choose the correct technology based on the task requirements:

* **Use React for:**  
  * **Interactive UIs:** Quizzes, calculators, forms, flashcards.  
  * **Data Visualization:** All charts and graphs (using Recharts).  
  * **Geography:** Maps (using React-Leaflet).  
* **Use Three.js for:**  
  * **Complex Animation & 3D:** When the concept involves 3D space, physics, or dynamic motion (e.g., solar systems, molecular structures). Ensure a continuous requestAnimationFrame loop.  
* **Use p5.js for:**  
  * **Simple 2D Sketches:** When a straightforward, animated 2D diagram is the best fit.

### **Layout and Sizing Rules**

* **Sizing is CRITICAL:** The visual is displayed in a padded container. You **must subtract 96px from the provided width and height** for your canvas or fixed-size component to prevent overflow.  
* **Responsiveness:** Layouts must be responsive and centered. Use flexbox, grid, or percentage-based units, especially for React components.  
* **Padding:** Ensure content does not touch the edges of your canvas or component.

### **Code Generation Rules**

#### **1\. React (React.createElement Syntax ONLY)**

* **CRITICAL SYNTAX:** You **MUST** use React.createElement() for all components. **NEVER use JSX tags (e.g., \<Card\>).**  
* **CRITICAL NAMING:** Your main component function **MUST** be named exactly one of the following: Component, App, Quiz, InteractiveComponent, Calculator, or Game.  
* **Available Hooks (No Import Needed):** useState, useEffect, useMemo, useCallback.  
* **Available UI Components:** Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Slider, etc.  
* **Available Chart Components (Recharts):** LineChart, BarChart, PieChart, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, etc.  
* **Available Map Components (React-Leaflet):** MapContainer, TileLayer (use OpenStreetMap), Marker, Popup, etc.  
* **Images:** For images in React, use standard 'img' elements with React.createElement('img', { src: 'url', alt: 'description', style: {...} }). Extract image URLs from markdown syntax in the task description. Style images to fit the illustrative aesthetic with border-radius, box-shadow, and proper sizing.
* **Styling for Illustrations:** Use inline styles with theme colors, gradients (linear-gradient, radial-gradient), border-radius for rounded shapes, box-shadow for depth, and CSS transforms for dynamic positioning. Create layered compositions with absolutely positioned elements when needed.

#### **2\. Three.js & p5.js**

* The code must be pure, self-contained JavaScript.  
* Do **NOT** include any HTML, CSS, or surrounding boilerplate.  
* **Images:** For p5.js, use loadImage(url) and image() functions. For Three.js, use THREE.TextureLoader to load images for materials.

### **Image Handling**

* **Detection:** Scan the task description for markdown image syntax: ![alt text](image_url).  
* **Extraction:** Extract all image URLs from the task description.  
* **Integration:** Incorporate these images into your visualization:  
  * For React: Use img elements or as backgrounds  
  * For p5.js: Use loadImage() in preload() or setup(), then image() to display  
  * For Three.js: Load as textures using THREE.TextureLoader  
* **Placement:** Position images logically within the visualization according to the task description's instructions.

### **Final Output Format**

Your entire response must be a single function call to display\_visual\_aid, containing the generated code and the user-facing explanation.`;

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

        const { task_description, panel_dimensions, theme, theme_colors } = await request.json();

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
The application is currently in ${theme} mode. You MUST use the following color palette to ensure perfect visual harmony and readability:

**Theme Color Palette (${theme} mode):**
- Background: ${theme_colors.background} - Use this for canvas/container backgrounds
- Foreground/Text: ${theme_colors.foreground} - Use this for all body text and labels
- Primary: ${theme_colors.primary} with text color ${theme_colors.primaryForeground} - Use for primary buttons and key interactive elements
- Secondary: ${theme_colors.secondary} with text color ${theme_colors.secondaryForeground} - Use for secondary actions
- Accent: ${theme_colors.accent} - Use sparingly for highlights and emphasis
- Muted: ${theme_colors.muted} with text ${theme_colors.mutedForeground} - Use for less prominent text and subtle backgrounds
- Border: ${theme_colors.border} - Use for dividers and borders

**MANDATORY RULES:**
1. ALL text must use either Foreground (${theme_colors.foreground}) or MutedForeground (${theme_colors.mutedForeground})
2. ALL buttons must use Primary/Secondary colors with their corresponding foreground colors
3. ALL backgrounds must be either Background or Muted colors
4. NEVER use arbitrary colors - only use colors from this palette
5. For charts/graphs, you may use variations of Primary, Secondary, and Accent colors
6. Ensure all text has sufficient contrast against its background`
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
