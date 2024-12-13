import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';

export async function POST(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);

        const { startTime, endTime } = await request.json();
        if (!startTime || !endTime) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // First, ensure the document exists with an empty periods array if it doesn't exist
        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            { $setOnInsert: { periods: [] } },
            { upsert: true }
        );

        // Then add the new period
        const newPeriod = {
            id: new Date().getTime().toString(),
            startTime,
            endTime
        };

        const result = await db.collection('timetables').updateOne(
            { level: decodedLevel },
            { $push: { periods: newPeriod } } as any
        );

        return NextResponse.json(newPeriod);
    } catch (error) {
        console.error('[PERIODS_POST]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);
        const client = await connectToDatabase();
        const db = client.db();

        const timetable = await db.collection('timetables')
            .findOne({ level: decodedLevel });

        const periods = timetable?.periods || [];
        periods.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

        return NextResponse.json(periods);
    } catch (error) {
        console.error('[PERIODS_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 