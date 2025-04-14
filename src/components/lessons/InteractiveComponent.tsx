import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { Quiz } from './Quiz';
import { Simulation } from './Simulation';
import { Diagram } from './Diagram';

interface InteractiveComponentProps {
  type: 'quiz' | 'simulation' | 'codeEditor' | 'diagram';
  content: {
    instructions: string;
    interactionData: any;
    feedback: {
      correct: string;
      incorrect: string;
    };
  };
  onComplete: (result: any) => void;
}

export const InteractiveComponent: React.FC<InteractiveComponentProps> = ({
  type,
  content,
  onComplete
}) => {
  const [feedback, setFeedback] = useState<string>('');

  const handleSubmit = (result: any) => {
    const isCorrect = validateResult(result);
    setFeedback(isCorrect ? content.feedback.correct : content.feedback.incorrect);
    onComplete(result);
  };

  const validateResult = (result: any) => {
    // Implement validation logic based on component type
    switch (type) {
      case 'quiz':
        return result.score > 0.7;
      case 'codeEditor':
        return result.compiled && result.testsPassed;
      case 'simulation':
        return result.completed;
      case 'diagram':
        return result.matched;
      default:
        return false;
    }
  };

  const renderComponent = () => {
    switch (type) {
      case 'quiz':
        return <Quiz data={content.interactionData} onSubmit={handleSubmit} />;
      case 'codeEditor':
        return <CodeEditor data={content.interactionData} onSubmit={handleSubmit} />;
      case 'simulation':
        return <Simulation data={content.interactionData} onSubmit={handleSubmit} />;
      case 'diagram':
        return <Diagram data={content.interactionData} onSubmit={handleSubmit} />;
      default:
        return <div>Unsupported component type</div>;
    }
  };

  return (
    <div className="interactive-component">
      <div className="instructions">{content.instructions}</div>
      {renderComponent()}
      {feedback && <div className="feedback">{feedback}</div>}
    </div>
  );
};