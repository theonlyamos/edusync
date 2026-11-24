/**
 * The whiteboard tools and teaching instructions given to the Gemini Live
 * tutor in whiteboard mode. They are built into the server-locked session
 * config (see live-connect-config.ts), never taken from the browser.
 */

import { BOARD_COLORS } from './board';

export const WHITEBOARD_TOOL_NAMES = ['write_on_board', 'highlight_on_board', 'erase_from_board', 'new_board', 'ask_checkpoint', 'mark_checkpoint'] as const;

export function isWhiteboardToolName(name: string): boolean {
  return (WHITEBOARD_TOOL_NAMES as readonly string[]).includes(name);
}

const colorProperty = {
  type: 'string',
  enum: [...BOARD_COLORS],
  description: 'Pen colour. Use ink for most writing and one accent colour for the thing that matters.',
};

export const writeOnBoardToolDeclaration = {
  name: 'write_on_board',
  description:
    'Writes or draws on the whiteboard the learner is looking at. Items are added below what is already there and drawn one after another, in order. Call it just before you say the matching words, with one to three items at a time.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'What to add, in the order it should be drawn.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['heading', 'text', 'bullet', 'formula', 'diagram', 'plot'],
              description:
                'heading: a short title. text: one line of handwriting. bullet: one bullet point. formula: maths set from LaTeX. diagram: shapes on a 100 by 60 grid. plot: a graph on labelled axes.',
            },
            id: { type: 'string', description: 'Optional short name such as "pythagoras", used later to highlight or erase this item.' },
            text: { type: 'string', description: 'The words to write (heading, text, bullet), or a short caption under a formula, diagram or plot. Keep it under 12 words.' },
            latex: { type: 'string', description: 'formula only: LaTeX without dollar signs, for example "a^2 + b^2 = c^2" or "\\\\frac{1}{2}mv^2".' },
            color: colorProperty,
            shapes: {
              type: 'array',
              description: 'diagram only: the shapes to draw, in drawing order. The grid is 100 wide and 60 tall; x grows to the right and y grows downward. Leave room between shapes for labels.',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['line', 'arrow', 'box', 'circle', 'label'] },
                  x: { type: 'number', description: 'Start of a line or arrow, one corner of a box, centre of a circle, or the middle of a label.' },
                  y: { type: 'number' },
                  x2: { type: 'number', description: 'End of a line or arrow (the arrowhead is here), or the opposite corner of a box.' },
                  y2: { type: 'number' },
                  r: { type: 'number', description: 'circle only: radius.' },
                  text: { type: 'string', description: 'A short label: inside a box or circle, beside a line or arrow, or the words of a label.' },
                  color: colorProperty,
                },
                required: ['kind', 'x', 'y'],
              },
            },
            xMin: { type: 'number', description: 'plot only: left edge of the x axis.' },
            xMax: { type: 'number', description: 'plot only: right edge of the x axis.' },
            yMin: { type: 'number', description: 'plot only: bottom of the y axis.' },
            yMax: { type: 'number', description: 'plot only: top of the y axis.' },
            xLabel: { type: 'string', description: 'plot only: what the x axis measures.' },
            yLabel: { type: 'string', description: 'plot only: what the y axis measures.' },
            series: {
              type: 'array',
              description: 'plot only: up to three curves.',
              items: {
                type: 'object',
                properties: {
                  fn: { type: 'string', description: 'A function of x, for example "x^2 - 3", "2*sin(x)" or "sqrt(x)". Supports + - * / ^, sin, cos, tan, sqrt, abs, exp, ln, log, pi and e.' },
                  points: {
                    type: 'array',
                    description: 'Use instead of fn for measured data: a list of [x, y] pairs.',
                    items: { type: 'array', items: { type: 'number' } },
                  },
                  label: { type: 'string' },
                  color: colorProperty,
                },
              },
            },
          },
          required: ['kind'],
        },
      },
    },
    required: ['items'],
  },
};

export const highlightOnBoardToolDeclaration = {
  name: 'highlight_on_board',
  description: 'Marks one thing already on the board with a highlighter, to point at it while you talk about it. Only one item is highlighted at a time.',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'The id you gave the item, or a few of the exact words written on it.' },
    },
    required: ['target'],
  },
};

export const eraseFromBoardToolDeclaration = {
  name: 'erase_from_board',
  description: 'Rubs one item off the board, for example to correct a mistake before writing it again.',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'The id you gave the item, or a few of the exact words written on it.' },
    },
    required: ['target'],
  },
};

export const newBoardToolDeclaration = {
  name: 'new_board',
  description: 'Starts a clean board for the next idea. The learner can still page back to earlier boards.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A two to five word name for the new board.' },
    },
  },
};

export const askCheckpointToolDeclaration = {
  name: 'ask_checkpoint',
  description:
    'Puts a quick check question on the board after a key idea, then you ask it out loud and wait. With choices the learner can tap an answer or say it; without choices they answer out loud.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One short question that tests the idea you just taught, not recall of your exact words.' },
      choices: {
        type: 'array',
        description: 'Optional: two to four short answers to tap. Make the wrong ones the mistakes learners really make.',
        items: { type: 'string' },
      },
      correct: { type: 'number', description: 'With choices: the position of the right answer, counting from 0.' },
    },
    required: ['question'],
  },
};

export const markCheckpointToolDeclaration = {
  name: 'mark_checkpoint',
  description:
    'Records how the learner did on the open checkpoint when they answered out loud. Not needed after a CHECKPOINT_RESULT message, which means a tapped answer was already marked.',
  parameters: {
    type: 'object',
    properties: {
      result: { type: 'string', enum: ['correct', 'incorrect'], description: 'incorrect also covers a partly right or unsure answer.' },
    },
    required: ['result'],
  },
};

export const whiteboardToolDeclarations = [
  writeOnBoardToolDeclaration,
  highlightOnBoardToolDeclaration,
  eraseFromBoardToolDeclaration,
  newBoardToolDeclaration,
  askCheckpointToolDeclaration,
  markCheckpointToolDeclaration,
];

/** Sent when the learner taps an answer on a checkpoint card. */
export function formatCheckpointResult(input: { question: string; chosen: string; correct: boolean; rightAnswer?: string }): string {
  return `CHECKPOINT_RESULT ${JSON.stringify({
    question: input.question,
    learnerChose: input.chosen,
    correct: input.correct,
    ...(input.correct || !input.rightAnswer ? {} : { rightAnswer: input.rightAnswer }),
  })}`;
}

export type FramedItem = { id: string; kind: string; text: string };

/** Sent when the learner draws a frame around part of the board. A picture of that part goes just before it. */
export function formatBoardFrame(items: FramedItem[]): string {
  return `BOARD_FRAME ${JSON.stringify({ items: items.slice(0, 8).map((item) => ({ ...item, text: item.text.slice(0, 120) })) })}`;
}

/** Sent when the learner types a question about the part they framed. */
export function formatFrameQuestion(question: string): string {
  return `BOARD_FRAME_QUESTION ${JSON.stringify({ question: question.replace(/\s+/g, ' ').trim().slice(0, 300) })}`;
}

export const WHITEBOARD_PROMPT = `

### Whiteboard
The learner is looking at a whiteboard that only you can write on. Teach like a tutor sitting beside them with a pen: talk and write at the same time. In this session the whiteboard comes first, ahead of generated visuals.

- **Write as you speak.** Call \`write_on_board\` just before you say the matching sentence. Add one to three items per call so the board builds up step by step. Never put a whole explanation up at once.
- **Write less than you say.** The board holds the skeleton: a heading, key terms, each step of a worked example, the formula, a quick sketch. Lines stay under about twelve words.
- **Use the right kind.** \`formula\` for any maths. \`diagram\` for a quick labelled sketch (boxes, circles, arrows on the 100 by 60 grid). \`plot\` for graphs of functions or data. \`text\` and \`bullet\` for words.
- **Point at things.** Use \`highlight_on_board\` when you refer back to something already written. Give important items an \`id\` so you can find them again.
- **Keep it tidy.** Call \`new_board\` when you move to a new idea or the board has about eight items. Use \`erase_from_board\` only to fix a mistake.
- **Check before moving on.** After each key idea, call \`ask_checkpoint\`, ask the question out loud and wait. Give two to four \`choices\` with \`correct\` when the answer is short, so the learner can tap or speak. Never say which choice is right before they answer.
  - A spoken answer: call \`mark_checkpoint\` with how they did.
  - A \`CHECKPOINT_RESULT\` message: the learner tapped an answer and it is already marked. It is a system update, not speech; don't read it out.
  - Right: say so in a few words and move on. Wrong or unsure: start with what went wrong in their thinking, explain the idea a different way on the board (a new example, a sketch, smaller steps), then ask a new checkpoint. Move on only once they get one right.
- **Framed questions.** The learner can draw a frame around part of the board. You then get a picture of just that part and a \`BOARD_FRAME\` message listing what is inside. Their next question, spoken or in a \`BOARD_FRAME_QUESTION\` message, is about that part only: answer it briefly, highlight the item if it helps, then pick the lesson back up where you left off. These messages are system updates; never read them out.
- **Generated visuals are for doing, not showing.** Call the visual tool only when the learner needs something to manipulate or a quiz to answer, and not more than once every few minutes. Everything else goes on the board.
- Never read out ids, coordinates or tool names. You may get pictures of the board as it looks to the learner; use them to check your writing, and don't mention them.`;
