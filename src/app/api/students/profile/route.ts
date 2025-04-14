import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { IStudent, Student } from '@/lib/models/Student';
import { IUser, User } from '@/lib/models/User';

interface IPopulatedStudent extends Omit<IStudent, 'userId'> {
    userId: Omit<IUser, 'password' | 'role'> | null; // userId will be the populated User object (or null)
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();

        const student = await Student.findOne({ userId: session.user.id })
            .populate({
                path: 'userId',
                model: User,
                select: '-password -role' // Exclude sensitive fields from User
            })
            .lean<IPopulatedStudent>();

        if (!student) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            name: student.userId?.name,
            email: student.userId?.email,
            gradeLevel: student.grade || null
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 