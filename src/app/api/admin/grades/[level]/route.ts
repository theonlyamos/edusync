import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET(
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

        const client = await connectToDatabase();
        const db = client.db();

        // Get students for this grade
        const students = await db.collection('users')
            .find({
                role: 'student',
                level: decodedLevel
            })
            .toArray();

        // Get teachers for this grade
        const teachers = await db.collection('users')
            .find({
                role: 'teacher'
            })
            .toArray();

        // Get lessons for this grade
        const lessons = await db.collection('lessons')
            .find({
                gradeLevel: decodedLevel
            })
            .toArray();

        // Get timetable for this grade
        const timetable = await db.collection('timetables')
            .findOne({
                level: decodedLevel
            });

        // Add lesson titles to the timetable
        const timeTableWithDetails = { ...timetable?.schedule };
        if (timeTableWithDetails) {
            Object.entries(timeTableWithDetails).forEach(([day, periods]: [string, any]) => {
                Object.entries(periods).forEach(([periodId, data]: [string, any]) => {
                    const lesson = lessons.find(l => l._id.toString() === data.lessonId);
                    if (lesson) {
                        timeTableWithDetails[day][periodId] = {
                            ...data,
                            lessonTitle: lesson.title
                        };
                    }
                });
            });
        }

        return NextResponse.json({
            students: students.map(student => ({
                ...student,
                _id: student._id.toString(),
                createdAt: student.createdAt?.toISOString()
            })),
            teachers: teachers.map(teacher => ({
                ...teacher,
                _id: teacher._id.toString(),
                createdAt: teacher.createdAt?.toISOString()
            })),
            lessons: lessons.map(lesson => ({
                ...lesson,
                _id: lesson._id.toString(),
                createdAt: lesson.createdAt?.toISOString()
            })),
            timeTable: timeTableWithDetails,
            periods: timetable?.periods || []
        });
    } catch (error) {
        console.error('[GRADE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 