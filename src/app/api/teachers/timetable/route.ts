import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Get all timetables
        const timetables = await db.collection('timetables')
            .find({})
            .toArray();

        // Get all periods from all grade levels
        const allPeriods: any[] = [];
        const filteredTimeTable: any = {};

        // Filter and collect all periods where this teacher is assigned
        timetables.forEach(timetable => {
            if (timetable?.schedule) {
                Object.entries(timetable.schedule).forEach(([day, periods]) => {
                    Object.entries(periods).forEach(([periodId, data]: [string, any]) => {
                        if (data.teacherId === session.user.id) {
                            if (!filteredTimeTable[day]) {
                                filteredTimeTable[day] = {};
                            }
                            filteredTimeTable[day][periodId] = {
                                ...data,
                                level: timetable.level
                            };

                            // Add period to allPeriods if not already included
                            const periodData = timetable.periods?.find((p: any) => p.id === periodId);
                            if (periodData && !allPeriods.some(p => p.id === periodId)) {
                                allPeriods.push({
                                    ...periodData,
                                    level: timetable.level
                                });
                            }
                        }
                    });
                });
            }
        });

        // Sort periods by start time
        allPeriods.sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Get the teacher's lessons
        const lessons = await db.collection('lessons')
            .find({
                teacherId: session.user.id
            })
            .toArray();

        return NextResponse.json({
            timeTable: filteredTimeTable,
            lessons: lessons.map(lesson => ({
                ...lesson,
                _id: lesson._id.toString()
            })),
            periods: allPeriods
        });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { timeTable, level } = await request.json();

        if (!level) {
            return new NextResponse('Grade level is required', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Get the current timetable for the specified grade
        const currentTimetable = await db.collection('timetables').findOne({
            level
        });

        // Merge the existing timetable with the teacher's updates
        const updatedSchedule = { ...(currentTimetable?.schedule || {}) };
        Object.entries(timeTable).forEach(([day, periods]: [string, any]) => {
            updatedSchedule[day] = updatedSchedule[day] || {};
            Object.entries(periods).forEach(([period, data]) => {
                updatedSchedule[day][period] = {
                    ...data,
                    teacherId: session.user.id // Ensure teacherId is set correctly
                };
            });
        });

        // Update or create the timetable
        await db.collection('timetables').updateOne(
            { level },
            {
                $set: {
                    schedule: updatedSchedule,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    level,
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