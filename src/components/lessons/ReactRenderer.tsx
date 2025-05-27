'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface ReactRendererProps {
  code: string;
}

export const ReactRenderer: React.FC<ReactRendererProps> = ({ code }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const RenderedComponent = useMemo(() => {
    setIsLoading(true);
    setError(null);

    try {
      // Create a safe execution environment with React hooks and UI components
      const createComponent = new Function(
        'React',
        'useState',
        'useEffect',
        'useMemo',
        'useCallback',
        'Button',
        'Input',
        'Card',
        'CardContent',
        'CardHeader',
        'CardTitle',
        'Badge',
        'Textarea',
        'Label',
        'RadioGroup',
        'RadioGroupItem',
        'Checkbox',
        'Select',
        'SelectContent',
        'SelectItem',
        'SelectTrigger',
        'SelectValue',
        'Slider',
        `
        ${code}
        
        // Return the component (assume it's the last expression or a default export)
        return typeof Component !== 'undefined' ? Component : 
               typeof App !== 'undefined' ? App :
               typeof Quiz !== 'undefined' ? Quiz :
               typeof InteractiveComponent !== 'undefined' ? InteractiveComponent :
               typeof Calculator !== 'undefined' ? Calculator :
               typeof Game !== 'undefined' ? Game :
               (() => React.createElement('div', {}, 'No component found'));
        `
      );

      const ComponentFunction = createComponent(
        React,
        useState,
        useEffect,
        useMemo,
        React.useCallback,
        Button,
        Input,
        Card,
        CardContent,
        CardHeader,
        CardTitle,
        Badge,
        Textarea,
        Label,
        RadioGroup,
        RadioGroupItem,
        Checkbox,
        Select,
        SelectContent,
        SelectItem,
        SelectTrigger,
        SelectValue,
        Slider
      );

      setIsLoading(false);
      return ComponentFunction;
    } catch (err: any) {
      setError(err.message || 'Failed to render React component');
      setIsLoading(false);
      return null;
    }
  }, [code]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600">Loading React component...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center">
          <div className="text-red-600 font-medium mb-2">Component Error</div>
          <div className="text-red-500 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!RenderedComponent) {
    return (
      <div className="flex items-center justify-center h-64 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="text-yellow-700">No component to render</div>
      </div>
    );
  }

  try {
    return (
      <div className="bg-white rounded-lg border p-6 min-h-64">
        <RenderedComponent />
      </div>
    );
  } catch (renderError: any) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center">
          <div className="text-red-600 font-medium mb-2">Render Error</div>
          <div className="text-red-500 text-sm">{renderError.message}</div>
        </div>
      </div>
    );
  }
}; 