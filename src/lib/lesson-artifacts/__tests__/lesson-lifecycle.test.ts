import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { groupStorageObjects, removeLesson } from '../lesson-lifecycle';
import { LessonArtifactHttpError } from '../server';

function fakeSupabase(rpcResult: { data: unknown; error: unknown }) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const updates: unknown[] = [];
  const client = {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    storage: {
      from: (bucket: string) => ({
        remove: vi.fn(async (paths: string[]) => { removed.push({ bucket, paths }); return { error: null }; }),
      }),
    },
    from: vi.fn(() => ({
      update: (values: unknown) => {
        updates.push(values);
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      },
    })),
  };
  return { client: client as never, removed, updates };
}

describe('removeLesson', () => {
  it('deletes a draft and removes its stored files', async () => {
    const { client, removed, updates } = fakeSupabase({
      data: [
        { storage_bucket: 'lesson-assets', storage_path: 'l/intro.jpg' },
        { storage_bucket: 'lesson-assets', storage_path: 'l/o1.jpg' },
      ],
      error: null,
    });
    await expect(removeLesson(client, 'lesson-1')).resolves.toBe('deleted');
    expect(removed).toEqual([{ bucket: 'lesson-assets', paths: ['l/intro.jpg', 'l/o1.jpg'] }]);
    expect(updates).toEqual([]);
  });

  it('archives a lesson that students already received', async () => {
    const { client, updates } = fakeSupabase({ data: null, error: { message: 'LESSON_HAS_HISTORY' } });
    await expect(removeLesson(client, 'lesson-1')).resolves.toBe('archived');
    expect(updates).toHaveLength(1);
    expect((updates[0] as { archived_at: string | null }).archived_at).toEqual(expect.any(String));
  });

  it('refuses while materials are still generating', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'LESSON_GENERATING' } });
    const error = await removeLesson(client, 'lesson-1').catch((caught) => caught);
    expect(error).toBeInstanceOf(LessonArtifactHttpError);
    expect(error.status).toBe(409);
  });

  it('passes unexpected database errors through', async () => {
    const failure = { message: 'connection reset' };
    const { client } = fakeSupabase({ data: null, error: failure });
    await expect(removeLesson(client, 'lesson-1')).rejects.toBe(failure);
  });
});

describe('groupStorageObjects', () => {
  it('groups paths by bucket and skips incomplete rows', () => {
    expect([...groupStorageObjects([
      { storage_bucket: 'a', storage_path: '1' },
      { storage_bucket: 'b', storage_path: '2' },
      { storage_bucket: 'a', storage_path: '3' },
      { storage_bucket: null, storage_path: '4' },
    ])]).toEqual([['a', ['1', '3']], ['b', ['2']]]);
  });
});
