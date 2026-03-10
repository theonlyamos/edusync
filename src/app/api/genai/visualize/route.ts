/**
 * POST /api/genai/visualize
 *
 * Generates interactive visualizations using the ADK visualization agent.
 * This route replaces the old OpenAI-SDK based route for the lean hackathon build.
 */

import { NextRequest, NextResponse } from 'next/server';
import { convertImageUrlsToBase64 } from '@/lib/imageUtils.server';
import {
    generateVisualization,
    type VisualizationRequest,
} from '@/lib/agents/visualization-agent';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { task_description, panel_dimensions, theme, theme_colors } = body;

        if (!task_description) {
            return NextResponse.json(
                { error: 'task_description is required' },
                { status: 400 },
            );
        }

        const vizRequest: VisualizationRequest = {
            taskDescription: task_description,
            panelDimensions: panel_dimensions,
            theme,
            themeColors: theme_colors,
        };

        const result = await generateVisualization(vizRequest);

        // Convert image URLs to base64 server-side to bypass CSP restrictions
        if (result.code) {
            result.code = await convertImageUrlsToBase64(result.code);
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('ADK Visualization agent error:', error);
        return NextResponse.json(
            { error: 'Failed to generate visualization', details: error.message },
            { status: 500 },
        );
    }
}
