import { describe, expect, it, vi } from 'vitest';

const visualize = vi.hoisted(() => vi.fn().mockResolvedValue({ library: 'react', code: 'function App(){ return null; }', explanation: 'Explore forces.' }));
const database = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: database }));
vi.mock('@/lib/ai', () => ({ generateAICompletion: vi.fn() }));
vi.mock('@/lib/visualize-ai-task', () => ({ runVisualizeGeneration: visualize }));
vi.mock('../media-provider', () => ({ embedGroundingText: vi.fn() }));

describe('session visualization drawable space', () => {
  it('uses the learner panel for new interactive fallback content', async () => {
    const { generateSessionArtifact } = await import('../learning-server');
    const result = await generateSessionArtifact({
      runId: 'run-1', studentId: 'student-1', kind: 'visualization',
      lesson: { id: 'lesson-1', title: 'Forces', subject: 'Science', gradeLevel: 'Grade 8' },
      objective: { id: 'objective-1', text: 'Explain forces.', revision: 1 },
      panelDimensions: { width: 296, height: 420 },
    });
    expect(visualize).toHaveBeenCalledWith(expect.objectContaining({ panel_dimensions: { width: 296, height: 420 } }));
    expect(result.studentArtifact.payload.kind).toBe('interactive_visualization');
    expect(database).not.toHaveBeenCalled();
  });
});
