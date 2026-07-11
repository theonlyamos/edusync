import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('normalized lesson ownership', () => {
  it('uses the teachers relation instead of the removed lessons.teacher column', async () => {
    const migration = await readFile(
      join(process.cwd(), 'supabase', 'migrations', '0033_objective_artifacts.sql'),
      'utf8',
    );
    const lessonServer = await readFile(
      join(process.cwd(), 'src', 'lib', 'lesson-artifacts', 'server.ts'),
      'utf8',
    );

    expect(migration).not.toContain('l.teacher = auth.uid()');
    expect(migration).not.toContain('content, teacher, teacher_id');
    expect(migration).toContain('t.user_id = auth.uid()');
    expect(lessonServer).not.toContain('content,teacher,teacher_id');
  });
});
