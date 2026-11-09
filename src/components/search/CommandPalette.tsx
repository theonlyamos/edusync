'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileCheck, GraduationCap, Loader2, School, Users, type LucideIcon } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { homeworkRequest } from '@/components/homework/shared';
import { SEARCH_KIND_LABEL, SEARCH_MAX, cleanSearchQuery, type SearchKind, type SearchResult } from '@/lib/search';

export type PaletteLink = { label: string; href: string };

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  student: GraduationCap,
  teacher: Users,
  class: School,
  lesson: BookOpen,
  homework: FileCheck,
};
const KINDS = Object.keys(SEARCH_KIND_LABEL) as SearchKind[];
const ITEM = 'group min-h-11 gap-2 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground';

/**
 * Jump-to search (Ctrl or ⌘ + K): the portal's pages for everyone, plus
 * students, classes, lessons and homework by name for teachers and school
 * administrators (`portal`).
 */
export function CommandPalette({ open, onOpenChange, links, portal }: { open: boolean; onOpenChange: (open: boolean) => void; links: PaletteLink[]; portal: 'school' | 'teacher' | null }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ for: string; results: SearchResult[]; failed?: boolean } | null>(null);
  const query = portal ? cleanSearchQuery(text) : null;

  useEffect(() => { if (!open) { setText(''); setFound(null); } }, [open]);

  // Ask the server a moment after typing stops; a newer keystroke drops the older answer.
  useEffect(() => {
    if (!open || !query || !portal) return;
    let live = true;
    const timer = setTimeout(() => {
      homeworkRequest<{ results: SearchResult[] }>(`/api/search?portal=${portal}&q=${encodeURIComponent(query)}`)
        .then((data) => { if (live) setFound({ for: query, results: data.results }); })
        .catch(() => { if (live) setFound({ for: query, results: [], failed: true }); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [open, query, portal]);

  const needle = text.trim().toLowerCase();
  const pages = useMemo(() => (needle ? links.filter((link) => link.label.toLowerCase().includes(needle)) : links), [links, needle]);
  // Answers for an earlier query are hidden as soon as the text changes, so Enter never opens a stale match.
  const current = query && found?.for === query ? found : null;
  const results = current ? current.results : [];
  const searching = Boolean(query) && !current;
  const go = (href: string) => { onOpenChange(false); router.push(href); };

  // Keep the highlight on the top row as the list changes, so Enter opens the best match.
  const ordered = KINDS.flatMap((kind) => results.filter((result) => result.kind === kind));
  const top = ordered[0] ? `${ordered[0].kind}:${ordered[0].id}` : pages[0] ? `page:${pages[0].href}` : '';
  const [selected, setSelected] = useState('');
  useEffect(() => { setSelected(top); }, [top]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-[calc(100vw-1.5rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">{portal ? 'Find a page, student, class, lesson or homework by name.' : 'Find a page by name.'}</DialogDescription>
        <Command shouldFilter={false} label="Search" value={selected} onValueChange={setSelected}>
          <CommandInput value={text} onValueChange={(value) => setText(value.slice(0, SEARCH_MAX))} placeholder={portal ? 'Search pages, students, lessons…' : 'Search pages…'} className="h-12 pr-10 text-base sm:text-sm" />
          <CommandList className="max-h-[min(60dvh,26rem)]">
            {!searching && pages.length === 0 && results.length === 0 && (
              <CommandEmpty>{current?.failed ? 'Search isn’t available right now. Try again.' : `Nothing found for “${text.trim()}”.`}</CommandEmpty>
            )}
            {KINDS.map((kind) => {
              const group = results.filter((result) => result.kind === kind);
              if (group.length === 0) return null;
              const Icon = KIND_ICON[kind];
              return (
                <CommandGroup key={kind} heading={SEARCH_KIND_LABEL[kind]}>
                  {group.map((result) => (
                    <CommandItem key={`${kind}:${result.id}`} value={`${kind}:${result.id}`} onSelect={() => go(result.href)} className={ITEM}>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-accent-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{result.title}</span>
                        {result.detail && <span className="block truncate text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground">{result.detail}</span>}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {searching && (
              <div role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…
              </div>
            )}
            {pages.length > 0 && (
              <CommandGroup heading="Pages">
                {pages.map((link) => (
                  <CommandItem key={link.href} value={`page:${link.href}`} onSelect={() => go(link.href)} className={ITEM}>{link.label}</CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
