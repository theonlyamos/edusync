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
      // Basic compilation check
      new Function(code);
      
      // Run tests
      const testResults = data.tests.map(test => {
        const testFn = new Function('userCode', `
          ${code}
          ${test}
        `);
        return testFn();
      });

      onSubmit({
        compiled: true,
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