import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('organization API route layout', () => {
  it('uses one dynamic slug name for every organization child route', async () => {
    const organizationsApi = join(process.cwd(), 'src', 'app', 'api', 'organizations');
    const entries = await readdir(organizationsApi, { withFileTypes: true });
    const dynamicSegments = entries
      .filter((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
      .map((entry) => entry.name);

    expect(dynamicSegments).toEqual(['[id]']);
  });
});
