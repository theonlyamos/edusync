import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);
        const client = await connectToDatabase();
        const db = client.db();

        const timetable = await db.collection('timetables').findOne({ level: decodedLevel });
        const schedule = timetable?.schedule || {};

        return NextResponse.json(schedule);
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !['admin', 'teacher'].includes(session.user.role as string)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);
        const { day, periodId, subject, teacherId, lessonId } = await request.json();

        if (!day || !periodId) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // First, ensure the document exists with an empty schedule if it doesn't exist
        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            {
                $setOnInsert: {
                    schedule: {},
                    periods: []
                }
            },
            { upsert: true }
        );

        // If both subject and teacherId are empty, remove the entry
        if (!subject && !teacherId) {
            await db.collection('timetables').updateOne(
                { level: decodedLevel },
                {
                    $unset: {
                        [`schedule.${day}.${periodId}`]: ""
                    }
                }
            );
        } else {
            // Update or create the entry
            await db.collection('timetables').updateOne(
                { level: decodedLevel },
                {
                    $set: {
                        [`schedule.${day}.${periodId}`]: {
                            subject: subject || '',
                            teacherId: teacherId || '',
                            lessonId: lessonId || undefined
                        }
                    }
                }
            );
        }

        // Get the updated timetable
        const updatedTimetable = await db.collection('timetables').findOne({ level: decodedLevel });
        return NextResponse.json(updatedTimetable?.schedule || {});
    } catch (error) {
        console.error('[TIMETABLE_PUT]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 