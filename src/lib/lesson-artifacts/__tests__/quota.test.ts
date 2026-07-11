import { describe, expect, it } from 'vitest';

import { quotaCategoryForJob } from '../quota';

describe('organization AI quota categories', () => {
  it('maps generation jobs to stable metering categories', () => {
    expect(quotaCategoryForJob('generate_interactive')).toBe('interactive_generation');
    expect(quotaCategoryForJob('generate_visual_quiz')).toBe('quiz_generation');
    expect(quotaCategoryForJob('generate_structured_quiz')).toBe('quiz_generation');
    expect(quotaCategoryForJob('generate_image')).toBe('image_generation');
    expect(quotaCategoryForJob('extract_media')).toBe('media_bytes');
  });
});
