import { z } from 'zod';

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const domainInputError = 'Allowed domains must be ASCII hostnames such as localhost, example.com or *.example.com, separated by commas or new lines. Omit protocols, ports and paths.';

export const allowedDomainsSchema = z.unknown().transform((input, context): string[] | null => {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string' && input.trim() === '') return null;
  if (Array.isArray(input) && input.length === 0) return null;

  const entries = typeof input === 'string' ? [input] : input;
  if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: domainInputError });
    return z.NEVER;
  }

  const domains = new Set<string>();
  for (const entry of entries as string[]) {
    const parts = entry.split(/[,\r\n]+/).map((part: string) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: domainInputError });
      return z.NEVER;
    }

    for (const part of parts) {
      const domain = part.toLowerCase().replace(/\.$/, '');
      const host = domain.startsWith('*.') ? domain.slice(2) : domain;
      let valid = host.length <= 253 && host.split('.').every((label: string) => hostnameLabel.test(label));
      if (valid) {
        try {
          valid = new URL(`https://${host}`).hostname === host;
        } catch {
          valid = false;
        }
      }
      if (!valid) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: domainInputError });
        return z.NEVER;
      }
      domains.add(domain);
    }
  }

  return [...domains];
});
