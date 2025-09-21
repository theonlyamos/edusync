import React, { useState } from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorProps {
  data: {
    initialCode: string;
    language: string;
    tests: string[];
  };
  onSubmit: (result: {compiled: boolean; testsPassed: boolean}) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ data, onSubmit }) => {
  const [code, setCode] = useState(data.initialCode);

  const runTests = async () => {
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
    <div className="w-full h-[400px] border rounded-md">
      <Editor
        height="100%"
        defaultLanguage={data.language}
        value={code}
        onChange={value => setCode(value || '')}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
        }}
      />
      <button 
        onClick={runTests}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Run Tests
      </button>
    </div>
  );
};