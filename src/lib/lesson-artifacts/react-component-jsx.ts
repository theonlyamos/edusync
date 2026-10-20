import ts from 'typescript';
import { assertReactComponentSyntax } from './react-component-source';

function parsesInSandbox(code: string): boolean {
  try {
    assertReactComponentSyntax(code);
    return true;
  } catch {
    return false;
  }
}

/**
 * Models write JSX far more reliably than hand-nested React.createElement calls, so the sandbox
 * contract accepts either: code that already runs is returned unchanged, anything else is compiled
 * from JSX to createElement calls. A syntax error is thrown with the offending line in its cause,
 * which is fed back to the model on the next attempt and never sent to the client.
 */
export function compileReactComponentJsx(code: string): string {
  if (parsesInSandbox(code)) return code;
  // Everything is injected, so module syntax (common alongside JSX) only breaks the sandbox.
  code = code
    .replace(/^\s*import\s[\s\S]*?\sfrom\s*['"][^'"]+['"]\s*;?[^\S\r\n]*$/gm, '')
    .replace(/^(\s*)export\s+(?:default\s+)?/gm, '$1');
  const { outputText, diagnostics } = ts.transpileModule(code, {
    fileName: 'component.jsx',
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const problem = diagnostics?.find(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (problem) {
    const message = ts.flattenDiagnosticMessageText(problem.messageText, ' ');
    let detail = message;
    if (problem.file && problem.start !== undefined) {
      const { line } = problem.file.getLineAndCharacterOfPosition(problem.start);
      detail = `line ${line + 1}: ${message} in \`${code.split(/\r?\n/)[line]?.trim().slice(0, 200)}\``;
    }
    throw new Error('Generated React code has invalid JavaScript syntax', { cause: new Error(detail) });
  }
  return outputText.trim();
}
