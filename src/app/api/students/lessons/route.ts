import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { Lesson } from '@/lib/models/Lesson';
import { Student } from '@/lib/models/Student';
import { authOptions } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();

        const student = await Student.findOne({ userId: session.user.id });

        if (!student || !student.grade) {
            return NextResponse.json({ message: 'Student record or grade not found' }, { status: 404 });
        }

        // Fetch lessons matching the student's grade
        const lessons = await Lesson.find({ gradeLevel: student.grade }).sort({ createdAt: -1 });

        return NextResponse.json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        return NextResponse.json(
            { message: 'An error occurred while fetching lessons' },
            { status: 500 }
        );
    }
} 