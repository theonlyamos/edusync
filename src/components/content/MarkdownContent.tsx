'use client';

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import { cn } from '@/lib/utils';

const remarkPlugins = [remarkGfm, remarkMath];
// Bad LaTeX from the AI shows as red source text instead of breaking the page.
const rehypePlugins: Parameters<typeof ReactMarkdown>[0]['rehypePlugins'] = [[rehypeKatex, { throwOnError: false, strict: 'ignore' }]];

/** Renders AI or teacher written Markdown, including $…$ and $$…$$ math, readable in light and dark mode. */
export function MarkdownContent({ children, className, size = 'sm' }: { children: string | null | undefined; className?: string; size?: 'sm' | 'base' }) {
  return (
    <div className={cn(
      'prose max-w-none break-words dark:prose-invert',
      size === 'sm' && 'prose-sm',
      '[&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1',
      className,
    )}>
      <ReactMarkdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{children ?? ''}</ReactMarkdown>
    </div>
  );
}
