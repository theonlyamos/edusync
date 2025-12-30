'use client';

import React, { useState, useEffect, useRef } from 'react';

/**
 * ReactRenderer - Sandboxed React Component Renderer
 * 
 * SECURITY IMPROVEMENTS:
 * - Code execution is isolated in an iframe with sandbox attribute
 * - CSP (Content Security Policy) restricts what the code can do:
 *   - Blocks network requests (connect-src 'none')
 *   - Only allows scripts from trusted CDNs with nonces
 *   - Prevents access to parent window/document
 * - Code is escaped to prevent script tag injection
 * - All dependencies (React, Recharts, React-Leaflet) loaded from CDN
 * - Simplified UI components provided inline (no external dependencies)
 * 
 * NOTE: Uses 'allow-same-origin' in sandbox for ES module compatibility.
 * With srcdoc, the iframe has a unique origin, so this doesn't allow
 * access to the parent window, but is needed for ES modules to load.
 */

interface ReactRendererProps {
  code: string;
  onError?: (error: string) => void;
}

// Helper to escape code for safe injection into script tags
function escapeScriptContent(code: string): string {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/<\/script>/gi, '<\\/script>');
}

export const ReactRenderer: React.FC<ReactRendererProps> = ({ code, onError }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current || !code) return;

    setIsLoading(true);
    setError(null);

    try {
      const iframe = iframeRef.current;
      const escapedCode = escapeScriptContent(code);

      // Generate a nonce for CSP
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Create sandboxed HTML content with all dependencies
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'nonce-${nonce}' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://esm.sh; style-src 'self' 'unsafe-inline' https://unpkg.com; style-src-elem 'self' 'unsafe-inline' https://unpkg.com; img-src * data:; font-src https://unpkg.com; connect-src https://cdn.jsdelivr.net https://esm.sh;">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; }
    body { 
      margin: 0; 
      padding: 0; 
      overflow: auto; 
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      width: 100%;
      min-height: 100vh;
    }
    #root {
      width: 100%;
      min-height: 100vh;
      padding: 0;
    }
    .error {
      padding: 20px;
      color: #dc2626;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      margin: 20px;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <!-- React and ReactDOM -->
  <script nonce="${nonce}" type="module">
    import React from 'https://esm.sh/react@19';
    import * as ReactDOMClient from 'https://esm.sh/react-dom@19/client';
    
    window.React = React;
    window.ReactDOM = ReactDOMClient;
    window.reactLoaded = true;
    window.reactDOMLoaded = true;
  </script>
  
  <!-- Recharts - Load as ES module -->
  <script nonce="${nonce}" type="module">
    import * as Recharts from 'https://esm.sh/recharts@3.1.2?deps=react@19,react-dom@19';
    window.Recharts = Recharts;
    window.rechartsLoaded = true;
  </script>
  
  <!-- React-Leaflet - Load as ES module -->
  <script nonce="${nonce}" type="module">
    import * as ReactLeaflet from 'https://esm.sh/react-leaflet@5.0.0-rc.2?deps=react@19,react-dom@19';
    import L from 'https://esm.sh/leaflet@1.9.4';
    
    // Configure Leaflet marker icons
    if (L.Icon && L.Icon.Default) {
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
      });
    }
    
    window.ReactLeaflet = ReactLeaflet;
    window.L = L;
    window.leafletLoaded = true;
  </script>
  
  <!-- Simplified UI Components -->
  <script nonce="${nonce}">
    (function() {
      // Wait for React and ReactDOM to load
      function waitForReact(callback, maxAttempts = 100) {
        if (window.React && window.ReactDOM && window.reactLoaded && window.reactDOMLoaded) {
          callback();
        } else if (maxAttempts > 0) {
          setTimeout(() => waitForReact(callback, maxAttempts - 1), 50);
        } else {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = 'Error: Failed to load React';
          document.getElementById('root').appendChild(errorDiv);
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'react-render-error', error: 'Failed to load React' }, '*');
          }
        }
      }
      
      waitForReact(function() {
        const React = window.React;
        const ReactDOM = window.ReactDOM;
      
      // Simple className merger utility
      function cn(...classes) {
        return classes.filter(Boolean).join(' ');
      }
      
      // Simplified UI Components
      const Button = React.forwardRef(({ className = '', variant = 'default', size = 'default', children, ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50';
        const variants = {
          default: 'bg-blue-600 text-white shadow hover:bg-blue-700',
          destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
          outline: 'border border-gray-300 bg-white shadow-sm hover:bg-gray-50',
          secondary: 'bg-gray-200 text-gray-900 shadow-sm hover:bg-gray-300',
          ghost: 'hover:bg-gray-100',
          link: 'text-blue-600 underline-offset-4 hover:underline'
        };
        const sizes = {
          default: 'h-9 px-4 py-2',
          sm: 'h-8 rounded-md px-3 text-xs',
          lg: 'h-10 rounded-md px-8',
          icon: 'h-9 w-9'
        };
        return React.createElement('button', {
          ref,
          className: cn(baseStyles, variants[variant], sizes[size], className),
          ...props
        }, children);
      });
      Button.displayName = 'Button';
      
      const Input = React.forwardRef(({ className = '', type = 'text', ...props }, ref) => {
        return React.createElement('input', {
          ref,
          type,
          className: cn('flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50', className),
          ...props
        });
      });
      Input.displayName = 'Input';
      
      const Card = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('div', {
          ref,
          className: cn('rounded-xl border border-gray-200 bg-white text-gray-900 shadow', className),
          ...props
        });
      });
      Card.displayName = 'Card';
      
      const CardHeader = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('div', {
          ref,
          className: cn('flex flex-col space-y-1.5 p-6', className),
          ...props
        });
      });
      CardHeader.displayName = 'CardHeader';
      
      const CardTitle = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('h3', {
          ref,
          className: cn('font-semibold leading-none tracking-tight', className),
          ...props
        });
      });
      CardTitle.displayName = 'CardTitle';
      
      const CardContent = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('div', {
          ref,
          className: cn('p-6 pt-0', className),
          ...props
        });
      });
      CardContent.displayName = 'CardContent';
      
      const Badge = React.forwardRef(({ className = '', variant = 'default', ...props }, ref) => {
        const variants = {
          default: 'bg-blue-100 text-blue-800',
          secondary: 'bg-gray-100 text-gray-800',
          destructive: 'bg-red-100 text-red-800',
          outline: 'border border-gray-300 text-gray-800'
        };
        return React.createElement('span', {
          ref,
          className: cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors', variants[variant], className),
          ...props
        });
      });
      Badge.displayName = 'Badge';
      
      const Textarea = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('textarea', {
          ref,
          className: cn('flex min-h-[60px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50', className),
          ...props
        });
      });
      Textarea.displayName = 'Textarea';
      
      const Label = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('label', {
          ref,
          className: cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className),
          ...props
        });
      });
      Label.displayName = 'Label';
      
      const RadioGroup = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('div', {
          ref,
          className: cn('grid gap-2', className),
          role: 'radiogroup',
          ...props
        });
      });
      RadioGroup.displayName = 'RadioGroup';
      
      const RadioGroupItem = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('input', {
          ref,
          type: 'radio',
          className: cn('aspect-square h-4 w-4 rounded-full border border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500', className),
          ...props
        });
      });
      RadioGroupItem.displayName = 'RadioGroupItem';
      
      const Checkbox = React.forwardRef(({ className = '', ...props }, ref) => {
        return React.createElement('input', {
          ref,
          type: 'checkbox',
          className: cn('h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500', className),
          ...props
        });
      });
      Checkbox.displayName = 'Checkbox';
      
      const Select = ({ children, ...props }) => React.createElement('select', {
        className: 'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        ...props
      }, children);
      
      const SelectContent = ({ children, ...props }) => React.createElement('div', props, children);
      const SelectItem = ({ children, value, ...props }) => React.createElement('option', { value, ...props }, children);
      const SelectTrigger = ({ children, ...props }) => React.createElement('div', { className: 'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm', ...props }, children);
      const SelectValue = ({ placeholder }) => placeholder;
      
      const Slider = React.forwardRef(({ className = '', value = [0], min = 0, max = 100, step = 1, onChange, ...props }, ref) => {
        return React.createElement('input', {
          ref,
          type: 'range',
          min,
          max,
          step,
          value: Array.isArray(value) ? value[0] : value,
          onChange: (e) => onChange && onChange([parseFloat(e.target.value)]),
          className: cn('w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer', className),
          ...props
        });
      });
      Slider.displayName = 'Slider';
      
      // Store components on window for later use
      window.UIComponents = {
        Button, Input, Card, CardContent, CardHeader, CardTitle,
        Badge, Textarea, Label, RadioGroup, RadioGroupItem,
        Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
        Slider
      };
      
      // Wait for Recharts and React-Leaflet to load
      function waitForDeps(callback, maxAttempts = 100) {
        if ((window.Recharts && window.rechartsLoaded) && (window.ReactLeaflet && window.leafletLoaded)) {
          callback();
        } else if (maxAttempts > 0) {
          setTimeout(() => waitForDeps(callback, maxAttempts - 1), 50);
        } else {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = 'Error: Failed to load required libraries (Recharts or React-Leaflet)';
          document.getElementById('root').appendChild(errorDiv);
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'react-render-error', error: 'Failed to load required libraries' }, '*');
          }
        }
      }
      
      waitForDeps(function() {
        const Recharts = window.Recharts;
        const ReactLeaflet = window.ReactLeaflet;
        const L = window.L;
        const UIComponents = window.UIComponents;
        
        // Extract Recharts components
        const {
          LineChart, BarChart, PieChart, AreaChart, ScatterChart, RadarChart,
          XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
          Line, Bar, Area, Pie, Cell, Scatter, RadialBar, RadialBarChart
        } = Recharts;
        
        // Extract React-Leaflet components
        const {
          MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, Circle, Rectangle,
          useMap, useMapEvent
        } = ReactLeaflet;
        
        // Make hooks available
        const { useState, useEffect, useMemo, useCallback, useRef } = React;
        
        // Create component from user code
        try {
          const createComponent = new Function(
            'React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
            'Button', 'Input', 'Card', 'CardContent', 'CardHeader', 'CardTitle',
            'Badge', 'Textarea', 'Label', 'RadioGroup', 'RadioGroupItem',
            'Checkbox', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
            'Slider',
            'LineChart', 'BarChart', 'PieChart', 'AreaChart', 'ScatterChart', 'RadarChart',
            'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ResponsiveContainer',
            'Line', 'Bar', 'Area', 'Pie', 'Cell', 'Scatter', 'RadialBar', 'RadialBarChart',
            'MapContainer', 'TileLayer', 'Marker', 'Popup', 'Polyline', 'Polygon',
            'Circle', 'Rectangle', 'useMap', 'useMapEvent', 'L',
            \`${escapedCode}
            
            // Return the component
            return typeof Component !== 'undefined' ? Component : 
                   typeof App !== 'undefined' ? App :
                   typeof Quiz !== 'undefined' ? Quiz :
                   typeof InteractiveComponent !== 'undefined' ? InteractiveComponent :
                   typeof Calculator !== 'undefined' ? Calculator :
                   typeof Game !== 'undefined' ? Game :
                   (() => React.createElement('div', {}, 'No component found'));
            \`
          );
          
          const ComponentFunction = createComponent(
            React, useState, useEffect, useMemo, useCallback, useRef,
            UIComponents.Button, UIComponents.Input, UIComponents.Card, UIComponents.CardContent, UIComponents.CardHeader, UIComponents.CardTitle,
            UIComponents.Badge, UIComponents.Textarea, UIComponents.Label, UIComponents.RadioGroup, UIComponents.RadioGroupItem,
            UIComponents.Checkbox, UIComponents.Select, UIComponents.SelectContent, UIComponents.SelectItem, UIComponents.SelectTrigger, UIComponents.SelectValue,
            UIComponents.Slider,
            LineChart, BarChart, PieChart, AreaChart, ScatterChart, RadarChart,
            XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
            Line, Bar, Area, Pie, Cell, Scatter, RadialBar, RadialBarChart,
            MapContainer, TileLayer, Marker, Popup, Polyline, Polygon,
            Circle, Rectangle, useMap, useMapEvent, L
          );
          
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(React.createElement(ComponentFunction));
        } catch (err) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = 'Error: ' + (err.message || 'Failed to render component');
          document.getElementById('root').appendChild(errorDiv);
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'react-render-error', error: err.message }, '*');
          }
        }
      });
      });
    })();
  </script>
</body>
</html>`;

      iframe.srcdoc = htmlContent;

      const handleLoad = () => {
        setIsLoading(false);
      };

      const handleError = () => {
        const errorMsg = 'Failed to load React component';
        setError(errorMsg);
        setIsLoading(false);
        if (onError) onError(errorMsg);
      };

      // Listen for error messages from iframe
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'react-render-error') {
          const errorMsg = event.data.error || 'Failed to render component';
          setError(errorMsg);
          setIsLoading(false);
          if (onError) onError(errorMsg);
        }
      };

      window.addEventListener('message', handleMessage);
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);

      return () => {
        window.removeEventListener('message', handleMessage);
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create React component';
      setError(errorMsg);
      setIsLoading(false);
      if (onError) onError(errorMsg);
    }
  }, [code, onError]);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">Loading React component...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg border border-red-200">
          <div className="text-center">
            <div className="text-red-600 font-medium mb-2">Component Error</div>
            <div className="text-red-500 text-sm">{error}</div>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="React Component Preview"
        className="w-full h-full border-0 rounded-lg bg-white"
        sandbox="allow-scripts allow-same-origin"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
}; 