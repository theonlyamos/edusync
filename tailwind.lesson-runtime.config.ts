import type { Config } from 'tailwindcss';

import { LESSON_RUNTIME_COMPATIBILITY_CLASSES } from './src/lib/lesson-artifacts/lesson-runtime-compatibility';

const colors = '(slate|gray|zinc|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const shades = '(50|100|200|300|400|500|600|700|800|900|950)';

export default {
  content: [
    './src/components/lessons/ReactRenderer.tsx',
    './src/lib/visualize-ai-task.ts',
  ],
  safelist: [
    { pattern: new RegExp(`^(bg|text|border|ring)-${colors}-${shades}$`) },
    { pattern: /^(flex|grid|block|inline|inline-flex|hidden|relative|absolute|fixed|overflow-hidden|overflow-auto)$/ },
    { pattern: /^(items|justify|content)-(start|end|center|between|around|evenly|stretch)$/ },
    { pattern: /^(w|h|min-w|min-h|max-w|max-h)-(full|screen|fit|min|max|auto)$/ },
    { pattern: /^(rounded|shadow)(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/ },
    { pattern: /^(font)-(normal|medium|semibold|bold|extrabold)$/ },
    { pattern: /^(text)-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|center|left|right)$/ },
    { pattern: /^(gap|space-x|space-y|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|8|10|12|16|20|24)$/ },
    { pattern: /^(w|h|min-w|min-h|max-w|max-h)-(0|1|2|3|4|5|6|8|10|12|16|20|24|32|40|48|56|64|72|80|96)$/ },
    { pattern: /^(opacity)-(0|10|20|25|30|40|50|60|70|75|80|90|100)$/ },
    'transition', 'transition-all', 'duration-200', 'duration-300', 'cursor-pointer', 'select-none',
    ...LESSON_RUNTIME_COMPATIBILITY_CLASSES,
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
