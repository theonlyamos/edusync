import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function PUT(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level, periodId } = params;
        const decodedLevel = decodeURIComponent(level);
        const { startTime, endTime } = await request.json();

        if (!startTime || !endTime) {
            return new NextResponse('Start time and end time are required', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('timetables').updateOne(
            {
                level: decodedLevel,
                'periods.id': periodId
            },
            {
                $set: {
                    'periods.$.startTime': startTime,
                    'periods.$.endTime': endTime
                }
            }
        );

        if (result.matchedCount === 0) {
            return new NextResponse('Period not found', { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating period:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level, periodId } = params;
        const decodedLevel = decodeURIComponent(level);

        const client = await connectToDatabase();
        const db = client.db();

        // Remove the period from the periods array
        const result = await db.collection('timetables').updateOne(
            { level: decodedLevel },
            {
                $pull: {
                    periods: { id: periodId }
                }
            }
        );

        if (result.matchedCount === 0) {
            return new NextResponse('Period not found', { status: 404 });
        }

        // Also remove any timetable entries for this period
        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            {
                $unset: {
                    [`schedule.Monday.${periodId}`]: "",
                    [`schedule.Tuesday.${periodId}`]: "",
                    [`schedule.Wednesday.${periodId}`]: "",
                    [`schedule.Thursday.${periodId}`]: "",
                    [`schedule.Friday.${periodId}`]: ""
                }
            }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting period:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 