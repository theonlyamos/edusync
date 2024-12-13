import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    { params }: { params: { level: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);

        const client = await connectToDatabase();
        const db = client.db();

        // Get all students in this grade
        const students = await db.collection('users')
            .find({
                role: 'student',
                level: decodedLevel
            })
            .project({
                password: 0,
                role: 0
            })
            .sort({ name: 1 })
            .toArray();

        // Get all teachers assigned to this grade
        const teachers = await db.collection('users')
            .find({
                role: 'teacher',
                level: decodedLevel
            })
            .project({
                password: 0,
                role: 0
            })
            .sort({ name: 1 })
            .toArray();

        // Get all lessons for this grade
        const lessons = await db.collection('lessons')
            .find({
                gradeLevel: decodedLevel
            })
            .sort({ createdAt: -1 })
            .toArray();

        // Get the timetable for this grade
        const timetable = await db.collection('timetables')
            .findOne({ level: decodedLevel });

        // Convert ObjectIds to strings
        const formattedData = {
            students: students.map(student => ({
                ...student,
                _id: student._id.toString()
            })),
            teachers: teachers.map(teacher => ({
                ...teacher,
                _id: teacher._id.toString()
            })),
            lessons: lessons.map(lesson => ({
                ...lesson,
                _id: lesson._id.toString()
            })),
            timeTable: timetable?.schedule || {},
            periods: timetable?.periods || []
        };

        return NextResponse.json(formattedData);
    } catch (error) {
        console.error('Error fetching grade details:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 