'use client';

import React, { useEffect, useRef, useState } from 'react';
import { mountMonacoEditor, type MountedMonacoEditor } from '@/lib/monaco-bootstrap';

interface CodeEditorProps {
  data: {
    initialCode: string;
    language: string;
    tests: string[];
  };
  onSubmit?: (result: { compiled: boolean; testsPassed: boolean }) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = React.memo(({ data, onSubmit }) => {
  const [code, setCode] = useState(data.initialCode);
  const [editorState, setEditorState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const hostRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<MountedMonacoEditor | null>(null);
  const codeRef = useRef(code);
  const focusOnReadyRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const controller = new AbortController();
    let owned: MountedMonacoEditor | undefined;
    setEditorState('loading');
    void mountMonacoEditor(hostRef.current, {
      getValue: () => codeRef.current,
      language: data.language,
      onChange: setCode,
    }, controller.signal).then(instance => {
      if (controller.signal.aborted) { instance.dispose(); return; }
      owned = instance;
      editorRef.current = instance;
      focusOnReadyRef.current = !!textareaRef.current && document.activeElement === textareaRef.current;
      setEditorState('ready');
    }, () => { if (!controller.signal.aborted) setEditorState('unavailable'); });
    return () => {
      controller.abort();
      owned?.dispose();
      focusOnReadyRef.current = false;
      if (editorRef.current === owned) editorRef.current = null;
    };
  }, [data.language]);

  useEffect(() => {
    codeRef.current = code;
    editorRef.current?.setValue(code);
  }, [code]);

  useEffect(() => {
    if (editorState !== 'ready' || !focusOnReadyRef.current) return;
    focusOnReadyRef.current = false;
    if (document.activeElement === document.body) editorRef.current?.focus();
  }, [editorState]);

  // Keep local code state in sync with parent-provided initialCode
  useEffect(() => {
    setCode(data.initialCode);
  }, [data.initialCode]);

  const runTests = async () => {
    if (!onSubmit) return;
    try {
      // Create a safe test environment using Web Workers or sandboxed evaluation
      // For now, we'll validate syntax without execution
      
      // Basic syntax validation (this is safer than executing)
      // In production, you'd want to use a proper code analysis tool
      const validateSyntax = (code: string) => {
        try {
          // Use a parser to validate syntax without execution
          // This is a placeholder - in production use something like @babel/parser
          if (!code || code.trim().length === 0) {
            return false;
          }
          // Check for common syntax patterns
          const hasFunction = /function\s+\w+|const\s+\w+\s*=\s*\(|let\s+\w+\s*=\s*\(/.test(code);
          const hasValidBraces = (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length;
          const hasValidParens = (code.match(/\(/g) || []).length === (code.match(/\)/g) || []).length;
          
          return hasFunction && hasValidBraces && hasValidParens;
        } catch {
          return false;
        }
      };
      
      const isValid = validateSyntax(code);
      
      // For tests, we'll simulate validation without actual execution
      // In a real implementation, you'd run tests in a sandboxed environment
      const testResults = data.tests.map(() => {
        // Placeholder for safe test execution
        // In production, use a sandboxed environment or service
        return isValid;
      });

      onSubmit({
        compiled: isValid,
        testsPassed: testResults.every(result => result === true)
      });
    } catch (error) {
      onSubmit({ compiled: false, testsPassed: false });
    }
  };

  return (
    <div className="w-full">
      <div className="relative h-[400px] border rounded-md">
        <div ref={hostRef} className={`absolute inset-0 ${editorState === 'ready' ? '' : 'invisible'}`} aria-hidden={editorState !== 'ready'} />
        {editorState !== 'ready' && (
          <div className="absolute inset-0 flex flex-col gap-2 p-3">
            <p role="status" className="text-sm text-muted-foreground">
              {editorState === 'loading' ? 'Loading editor. You can start typing below.' : 'Advanced editor unavailable. You can keep editing below.'}
            </p>
            <textarea ref={textareaRef} aria-label="Code" value={code} onChange={event => setCode(event.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none rounded border bg-background p-2 font-mono text-sm" />
          </div>
        )}
      </div>
      {onSubmit && <button
        onClick={runTests}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Run Tests
      </button>}
    </div>
  );
});

CodeEditor.displayName = 'CodeEditor';
