import { describe, expect, it } from 'vitest';
import { allowedDomainsSchema } from '@/lib/validation/api-key-domains';

describe('allowed domain input validation', () => {
  it('normalizes commas and line breaks across array entries', () => {
    expect(allowedDomainsSchema.parse([
      ' LOCALHOST, INSYTE.VERCEL.APP ',
      'insyte.vercel.app\r\n*.Example.COM.',
    ])).toEqual(['localhost', 'insyte.vercel.app', '*.example.com']);
  });

  it.each([null, undefined, [], '', ' \r\n '].map(input => ({ input })))('preserves unrestricted empty input $input', ({ input }) => {
    expect(allowedDomainsSchema.parse(input)).toBeNull();
  });

  it.each([
    'example.com',
    '*.example.com',
    'localhost',
    '*.localhost',
    '127.0.0.1',
    'xn--bcher-kva.example',
    `${'a'.repeat(63)}.example`,
    [63, 63, 63, 61].map(length => 'a'.repeat(length)).join('.'),
  ])('accepts supported host pattern %s', input => {
    expect(allowedDomainsSchema.parse(input)).toEqual([input]);
  });

  it.each([
    [''],
    ['good.example', '  '],
    ',',
    '\n,\n',
    'https://example.com',
    'example.com:443',
    'example.com/path',
    'user@example.com',
    'example.com?query',
    'example.com#fragment',
    'example.com\\path',
    'example_com',
    'bad..example',
    '.example',
    'example..',
    '-example.com',
    'example-.com',
    '999.1.1.1',
    '127.1',
    '0x7f000001',
    '001.2.3.4',
    '2130706433',
    'xn--a.example',
    `${'a'.repeat(64)}.example`,
    Array(5).fill('a'.repeat(63)).join('.'),
    [63, 63, 63, 62].map(length => 'a'.repeat(length)).join('.'),
    '*',
    '*example.com',
    '*.*.example.com',
    'sub.*.example.com',
    ['good.example', null],
    true,
    0,
    {},
  ].map(input => ({ input })))('rejects malformed or non-string input $input', ({ input }) => {
    expect(allowedDomainsSchema.safeParse(input).success).toBe(false);
  });

  it('rejects the whole input when a valid host precedes an invalid host', () => {
    expect(allowedDomainsSchema.safeParse('example.com, https://bad.example').success).toBe(false);
  });
});
