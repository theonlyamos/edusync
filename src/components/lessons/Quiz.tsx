import React, { useState } from 'react';

interface QuizProps {
  data: {
    questions: Array<{
      id: string;
      type: 'multiple' | 'short';
      question: string;
      options?: string[];
      answer: string;
    }>;
  };
  onSubmit: (result: { score: number }) => void;
}

export const Quiz: React.FC<QuizProps> = ({ data, onSubmit }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const score = data.questions.reduce((acc, q) => {
      return acc + (answers[q.id]?.toLowerCase() === q.answer.toLowerCase() ? 1 : 0);
    }, 0) / data.questions.length;

    onSubmit({ score });
  };

  return (
    <div className="space-y-4">
      {data.questions.map(q => (
        <div key={q.id} className="p-4 border rounded">
          <p className="font-medium mb-2">{q.question}</p>
          {q.type === 'multiple' ? (
            <div className="space-y-2">
              {q.options?.map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="radio"
                    name={q.id}
                    value={option}
                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                  />
                  <span className="ml-2">{option}</span>
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              className="w-full p-2 border rounded"
              onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
            />
          )}
        </div>
      ))}
      <button
        onClick={handleSubmit}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Submit
      </button>
    </div>
  );
};