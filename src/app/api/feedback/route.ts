import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const feedback = await request.json();

        // Log feedback to console (you can replace this with your preferred storage)
        console.log('=== USER FEEDBACK ===');
        console.log('Timestamp:', feedback.timestamp);
        console.log('Trigger:', feedback.trigger);
        console.log('Rating:', feedback.rating);
        console.log('Would Recommend:', feedback.wouldRecommend);

        if (feedback.experience) {
            console.log('Experience:', feedback.experience);
        }

        if (feedback.improvements) {
            console.log('Improvements:', feedback.improvements);
        }

        console.log('User Agent:', feedback.userAgent);
        console.log('====================');

        // Here you could save to a database, send to analytics service, etc.
        // For now, we'll just acknowledge receipt

        return NextResponse.json({
            success: true,
            message: 'Feedback received successfully'
        });

    } catch (error) {
        console.error('Failed to process feedback:', error);
        return NextResponse.json(
            { error: 'Failed to process feedback' },
            { status: 500 }
        );
    }
}
