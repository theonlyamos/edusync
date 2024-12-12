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
                role: 'teacher',
                level: student.level
            })
            .toArray();

        // Get all lessons for this grade level
        const lessons = await db.collection('lessons')
            .find({
                gradeLevel: student.level
            })
            .toArray();

        // Add teacher names to the timetable
        const timeTableWithTeachers = { ...timetable?.schedule };
        if (timeTableWithTeachers) {
            Object.entries(timeTableWithTeachers).forEach(([day, periods]: [string, any]) => {
                Object.entries(periods).forEach(([period, data]: [string, any]) => {
                    const teacher = teachers.find(t => t._id.toString() === data.teacherId);
                    if (teacher) {
                        timeTableWithTeachers[day][period] = {
                            ...data,
                            teacher: teacher.name
                        };
                    }
                });
            });
        }

        return NextResponse.json({
            timeTable: timeTableWithTeachers || {},
            lessons: lessons.map(lesson => ({
                ...lesson,
                _id: lesson._id.toString()
            }))
        });
    } catch (error) {
        console.error('Error fetching timetable:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 