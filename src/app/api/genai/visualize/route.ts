import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context'
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
        "Helicone-Target-Url": PROVIDER_BASE_URL,
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

**IMPORTANT: Sandboxed Execution Environment**
* React components run in an isolated iframe for security
* All dependencies (React, Recharts, React-Leaflet) are loaded as ES Modules (ESM) from esm.sh globally
* UI components are simplified versions that use Tailwind CSS classes directly
* **CRITICAL: NO IMPORTS/EXPORTS:** The code is evaluated in a sandboxed function body. You **MUST NOT** use \`import\` or \`export\` statements.All dependencies(React, Recharts, React - Leaflet, UI components) are injected globally.
* ** CRITICAL SYNTAX:** You ** MUST ** use React.createElement() for all components. ** NEVER use JSX tags(e.g., \<Card\>).**  
* ** CRITICAL NAMING:** Your main component function ** MUST ** be named exactly one of the following: Component, App, Quiz, InteractiveComponent, Calculator, or Game.  
* ** Available Hooks(No Import Needed):** useState, useEffect, useMemo, useCallback, useRef.  
* ** Available UI Components(Simplified Versions):** 
  * ** Button:** Supports \`variant\` prop: 'default', 'destructive', 'outline', 'secondary', 'ghost', 'link'. Supports \`size\` prop: 'default', 'sm', 'lg', 'icon'.
  * **Input:** Standard text input with styling.
  * **Card, CardHeader, CardTitle, CardContent:** Basic card components for layout.
  * **Badge:** Supports \`variant\` prop: 'default', 'secondary', 'destructive', 'outline'.
  * **Textarea:** Multi-line text input.
  * **Label:** Form label component.
  * **RadioGroup, RadioGroupItem:** Basic radio button group (simplified - use native radio inputs).
  * **Checkbox:** Standard checkbox input.
  * **Select, SelectContent, SelectItem, SelectTrigger, SelectValue:** Simplified select component (uses native HTML select - limited styling).
  * **Slider:** Range input slider.
  * **Quiz:** Built-in quiz component.
    * Props:
      * \`data\`: Object with \`questions\` array. Each question: \`{ id: string, type: 'multiple' | 'short', question: string, options ?: string[], answer: string } \`.
      * \`onSubmit\`: (Optional) Callback function \`(result) => void \`. Result is \`{ score: number } \`.
  * **NOTE:** These are simplified versions running in a sandboxed iframe. They use Tailwind CSS classes directly (not CSS variables). Complex interactions like portals, animations, or advanced Radix UI features are not available.
  * **Component Limitations:**
    * Select components use native HTML select (limited styling, no custom dropdown)
    * RadioGroup and Checkbox are basic HTML inputs with styling
    * No advanced features like tooltips, popovers, or dropdown menus beyond native select
    * All components support standard HTML props (onClick, onChange, className, style, etc.)
* **Available Chart Components (Recharts):** LineChart, BarChart, PieChart, AreaChart, ScatterChart, RadarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, Bar, Area, Pie, Cell, Scatter, RadialBar, RadialBarChart. All Recharts components work normally.
* **Available Map Components (React-Leaflet):** MapContainer, TileLayer (use OpenStreetMap), Marker, Popup, Polyline, Polygon, Circle, Rectangle, useMap, useMapEvent. All React-Leaflet components work normally.
* **Styling Notes:**
  * Components use Tailwind CSS utility classes directly (e.g., 'bg-blue-600', 'text-white', 'rounded-md').
  * For theme colors, use appropriate Tailwind color classes that match the theme (e.g., 'bg-blue-600' for primary, 'bg-gray-200' for secondary).
  * You can add custom \`className\` props to components for additional styling.
  * Use inline \`style\` props for dynamic values or gradients.
* **Images:** For images in React, use standard 'img' elements with React.createElement('img', { src: 'url', alt: 'description', style: {...} }). Extract image URLs from markdown syntax in the task description. Style images to fit the illustrative aesthetic with border-radius, box-shadow, and proper sizing.
* **Styling for Illustrations:** Use inline styles with gradients (linear-gradient, radial-gradient), border-radius for rounded shapes, box-shadow for depth, and CSS transforms for dynamic positioning. Create layered compositions with absolutely positioned elements when needed. Use Tailwind classes for standard styling.

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
