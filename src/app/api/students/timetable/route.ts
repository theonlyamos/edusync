import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Get the student's grade level
        const student = await db.collection('users').findOne({
            _id: new ObjectId(session.user.id),
            role: 'student'
        });

        if (!student?.level) {
            return NextResponse.json({ timeTable: {} });
        }

        // Get the timetable for the student's grade
        const timetable = await db.collection('timetables').findOne({
            level: student.level
        });

        // Get all teachers for this grade
        const teachers = await db.collection('users')
            .find({
                role: 'teacher'
            })
            .toArray();

        // Get all lessons for this grade level
        const lessons = await db.collection('lessons')
            .find({
                gradeLevel: student.level
            })
            .toArray();

        // Add teacher names and lesson titles to the timetable
        const timeTableWithDetails = { ...timetable?.schedule };
        if (timeTableWithDetails) {
            Object.entries(timeTableWithDetails).forEach(([day, periods]: [string, any]) => {
                Object.entries(periods).forEach(([periodId, data]: [string, any]) => {
                    const teacher = teachers.find(t => t._id.toString() === data.teacherId);
                    const lesson = lessons.find(l => l._id.toString() === data.lessonId);

                    timeTableWithDetails[day][periodId] = {
                        ...data,
                        teacherName: teacher?.name || 'No teacher assigned',
                        lessonTitle: lesson?.title
                    };
                });
            });
        }

        // Sort periods by start time
        const periods = timetable?.periods || [];
        periods.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

        return NextResponse.json({
            timeTable: timeTableWithDetails || {},
            lessons: lessons.map(lesson => ({
                ...lesson,
                _id: lesson._id.toString()
            })),
            periods
        });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 