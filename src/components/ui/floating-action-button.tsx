import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FloatingActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  position?: 'bottom-right' | 'bottom-left';
  className?: string;
}

export function FloatingActionButton({
  icon,
  label,
  onClick,
  position = 'bottom-right',
  className,
}: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        'fixed z-40 shadow-lg hover:shadow-xl transition-all',
        'flex items-center gap-2 px-5 py-6 rounded-full',
        'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70',
        'text-primary-foreground font-medium',
        position === 'bottom-right' ? 'bottom-6 right-6' : 'bottom-6 left-6',
        className
      )}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
