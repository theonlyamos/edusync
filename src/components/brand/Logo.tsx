import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Accessible name. Leave empty when the mark sits next to the visible wordmark. */
  title?: string;
};

/** InsyteAI mark: an open book with an orange spark above it. Colours follow light/dark theme. */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M31 56 C 24 50, 14 49, 4 51 V 25 C 14 23, 24 25, 31 31 Z"
        className="fill-[#2e9474] dark:fill-[#3fb58f]"
      />
      <path
        d="M33 56 C 40 50, 50 49, 60 51 V 25 C 50 23, 40 25, 33 31 Z"
        className="fill-[#1f5e4b] dark:fill-[#8fd9bd]"
      />
      <circle cx="32" cy="13" r="7.5" className="fill-[#e5662a] dark:fill-[#f07a3e]" />
      <g strokeWidth="3.2" strokeLinecap="round" className="stroke-[#e5662a] dark:stroke-[#f07a3e]">
        <path d="M14.5 13 H19.5" />
        <path d="M44.5 13 H49.5" />
        <path d="M19.5 2.5 L23 5.5" />
        <path d="M44.5 2.5 L41 5.5" />
      </g>
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  /** Show the mark only (for collapsed navigation). */
  iconOnly?: boolean;
};

/** InsyteAI mark + wordmark lockup. */
export function Logo({ className, markClassName, wordmarkClassName, iconOnly = false }: LogoProps) {
  if (iconOnly) {
    return <LogoMark className={markClassName} title="InsyteAI" />;
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn("text-xl font-semibold tracking-tight text-foreground", wordmarkClassName)}
        style={{ fontFamily: "var(--font-display), ui-serif, Georgia, serif" }}
      >
        Insyte<span className="text-[#2e9474] dark:text-[#3fb58f]">AI</span>
      </span>
    </span>
  );
}
