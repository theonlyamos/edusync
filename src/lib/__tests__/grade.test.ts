import { describe, expect, it } from 'vitest';
import { formatGrade } from '../grade';

describe('formatGrade', () => {
  it('capitalises school level prefixes', () => {
    expect(formatGrade('jhs 1')).toBe('JHS 1');
    expect(formatGrade(' shs 3 ')).toBe('SHS 3');
  });
  it('leaves other grades alone', () => {
    expect(formatGrade('Grade 7')).toBe('Grade 7');
    expect(formatGrade(null)).toBe('');
  });
});
