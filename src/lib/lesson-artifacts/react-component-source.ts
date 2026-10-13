/** The namespace supplied to generated code by the opaque React sandbox. */
export const REACT_COMPONENT_ARGUMENTS = [
  'React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
  'Button', 'Input', 'Card', 'CardContent', 'CardHeader', 'CardTitle',
  'Badge', 'Textarea', 'Label', 'RadioGroup', 'RadioGroupItem',
  'Checkbox', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
  'Slider', 'Quiz',
  'LineChart', 'BarChart', 'PieChart', 'AreaChart', 'ScatterChart', 'RadarChart',
  'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ResponsiveContainer',
  'Line', 'Bar', 'Area', 'Pie', 'Cell', 'Scatter', 'RadialBar', 'RadialBarChart',
  'MapContainer', 'TileLayer', 'Marker', 'Popup', 'Polyline', 'Polygon',
  'Circle', 'Rectangle', 'useMap', 'useMapEvent', 'L',
] as const;

const COMPONENT_EXPORT_PATTERN = /(?:^|\s)(?:const|function)\s+(Component|App|Quiz|InteractiveComponent|Calculator|Game)\b/;
const BARE_ELEMENT_PATTERN = /^React\.createElement\s*\(/;
const REACT_HOOK_DESTRUCTURE_LINE = /^\s*(?:const|let|var)\s*\{[^}]*\}\s*=\s*React\s*;?\s*$/;
const REACT_IMPORT_LINE = /^\s*import\s+.+from\s+['"]react(?:-dom)?['"]\s*;?\s*$/;

/** Preserve the renderer's compatibility preparation before syntax checking. */
export function prepareReactComponentCode(input: string): string {
  const lines = input.split(/\r?\n/);
  let start = 0;
  while (start < lines.length && REACT_IMPORT_LINE.test(lines[start]!)) start++;
  const body = lines.slice(start).filter(line => !REACT_HOOK_DESTRUCTURE_LINE.test(line)).join('\n');
  const trimmed = body.trim();
  if (!COMPONENT_EXPORT_PATTERN.test(trimmed) && BARE_ELEMENT_PATTERN.test(trimmed)) {
    return `const Component = () => (${trimmed});`;
  }
  return body;
}

/** Parse in the renderer's function scope; never invoke the generated body. */
export function assertReactComponentSyntax(code: string): void {
  try {
    new Function(...REACT_COMPONENT_ARGUMENTS, prepareReactComponentCode(code));
  } catch {
    throw new Error('Generated React code has invalid JavaScript syntax');
  }
}
