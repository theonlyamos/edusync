'use client';

import { Button } from '@/components/ui/button';
import type { QuickAction } from './study-actions';

interface QuickActionsProps {
  actions: QuickAction[];
  disabled?: boolean;
  onAction: (action: QuickAction) => void;
}

export function QuickActions({ actions, disabled, onAction }: QuickActionsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <Button
            key={action.intent}
            variant="outline"
            className="h-auto justify-start gap-3 whitespace-normal p-3 text-left"
            disabled={disabled}
            onClick={() => onAction(action)}
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{action.label}</span>
              <span className="block text-xs font-normal text-muted-foreground">{action.description}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
