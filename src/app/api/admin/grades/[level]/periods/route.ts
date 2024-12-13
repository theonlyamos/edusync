import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = params;
        const decodedLevel = decodeURIComponent(level);

        const client = await connectToDatabase();
        const db = client.db();

        const timetable = await db.collection('timetables').findOne({
            level: decodedLevel
        });

        return NextResponse.json({ periods: timetable?.periods || [] });
    } catch (error) {
        console.error('Error fetching periods:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = params;
        const decodedLevel = decodeURIComponent(level);
        const { startTime, endTime } = await request.json();

        if (!startTime || !endTime) {
            return new NextResponse('Start time and end time are required', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const period = {
            id: uuidv4(),
            startTime,
            endTime
        };

        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            {
                $push: { periods: period },
                $setOnInsert: {
                    level: decodedLevel,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        return NextResponse.json({ period });
    } catch (error) {
        console.error('Error creating period:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 