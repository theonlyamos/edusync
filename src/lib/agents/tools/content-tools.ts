/**
 * Content-related tools for ADK agents.
 *
 * Wraps existing utilities (Tavily, image conversion) as ADK FunctionTools.
 */

import { FunctionTool, GoogleSearchTool } from '@google/adk';
import { Type } from '@google/genai';

// ---------------------------------------------------------------------------
// Tavily external content fetch
// ---------------------------------------------------------------------------

export const fetchExternalContent = new FunctionTool({
    name: 'fetch_external_content',
    description:
        'Fetches content from an external URL using the Tavily API and returns it as markdown.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            url: {
                type: Type.STRING,
                description: 'The URL to fetch content from',
            },
        },
        required: ['url'],
    },
    execute: async (input: unknown) => {
        const args = input as { url: string };
        const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
        if (!TAVILY_API_KEY) {
            return { error: 'TAVILY_API_KEY is not configured' };
        }

        try {
            const response = await fetch('https://api.tavily.com/content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': TAVILY_API_KEY,
                },
                body: JSON.stringify({
                    url: args.url,
                    include_images: false,
                    include_links: true,
                }),
            });

            if (!response.ok) {
                return { error: `Failed to fetch URL content: ${response.statusText}` };
            }

            const data = await response.json();
            return {
                title: data.title,
                content: data.content,
                url: args.url,
            };
        } catch (error: any) {
            return { error: `Failed to fetch content: ${error.message}` };
        }
    },
});

// ---------------------------------------------------------------------------
// Google Search (built-in ADK tool)
// ---------------------------------------------------------------------------

export const googleSearch = new GoogleSearchTool();
