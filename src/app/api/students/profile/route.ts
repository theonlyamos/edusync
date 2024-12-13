import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const student = await db.collection('users').findOne(
            { _id: new ObjectId(session.user.id) },
            { projection: { level: 1, name: 1, email: 1 } }
        );

        if (!student) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            name: student.name,
            email: student.email,
            gradeLevel: student.level || null
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 