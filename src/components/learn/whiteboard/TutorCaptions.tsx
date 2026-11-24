'use client';

import { captionTail } from '@/lib/whiteboard/captions';

/**
 * What the tutor is saying, as subtitles above the voice controls. Hidden from
 * screen readers because the same words are already being spoken.
 */
export function TutorCaptions({ text }: { text: string }) {
  const line = captionTail(text);
  if (!line) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
      <p data-tutor-captions className="max-w-2xl rounded-lg bg-black/75 px-3 py-1.5 text-center text-sm leading-snug text-white shadow-lg sm:text-base">
        {line}
      </p>
    </div>
  );
}
