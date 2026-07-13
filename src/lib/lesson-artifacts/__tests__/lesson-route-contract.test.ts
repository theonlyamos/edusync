import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('lesson mutation route ownership', () => {
  it('uses normalized teacher ownership and database-shaped updates', async () => {
    const route = await readFile(
      join(process.cwd(), 'src', 'app', 'api', 'lessons', '[lessonId]', 'route.ts'),
      'utf8',
    );

    expect(route).not.toContain(".select('id, teacher')");
    expect(route).not.toMatch(/existing\.teacher(?!_)/);
    expect(route).not.toMatch(/lesson\.teacher(?!_)/);
    expect(route).toContain(".select('id, teacher_id, organization_id')");
    expect(route).toContain(".from('teachers')");
    expect(route).toContain(".select('user_id')");
    expect(route).not.toContain('organization_id: body.organizationId ?? null');
    expect(route).toContain('mapLessonUpdate(');
    expect(route).toContain('isLessonOrganizationGuardError(');
    expect(route).toContain('createServerSupabase');
    expect(route).toContain('createSSRUserSupabase');
    expect(route).toContain('mapLessonRecord(updatedLesson)');
  });
});
