import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function PUT(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { timeTable, periods } = await request.json();
        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);

        const client = await connectToDatabase();
        const db = client.db();

        // Update or create the timetable with periods
        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            {
                $set: {
                    schedule: timeTable,
                    periods: periods,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    level: decodedLevel,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating timetable:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);

        const client = await connectToDatabase();
        const db = client.db();

        // Get the timetable for this grade
        const timetable = await db.collection('timetables').findOne({
            level: decodedLevel
        });

        return NextResponse.json({
            timeTable: timetable?.schedule || {},
            periods: timetable?.periods || []
        });
    } catch (error) {
        console.error('Error fetching timetable:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 