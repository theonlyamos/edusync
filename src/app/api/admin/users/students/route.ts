import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { EDUCATION_LEVELS, type EducationLevel } from '@/lib/constants';
import { hash } from 'bcryptjs';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const students = await db.collection('users')
            .find({ role: 'student' })
            .project({
                password: 0,
                role: 0,
            })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(students.map(student => ({
            ...student,
            _id: student._id.toString()
        })));
    } catch (error) {
        console.error('Error fetching students:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { name, email, password, level } = await req.json();

        if (!name || !email || !password || !level) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        // Validate level
        if (!EDUCATION_LEVELS.includes(level as EducationLevel)) {
            return new NextResponse('Invalid education level', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Check if email already exists
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return new NextResponse('Email already exists', { status: 400 });
        }

        const result = await db.collection('users').insertOne({
            name,
            email,
            password: await hash(password, 12),
            role: 'student',
            status: 'active',
            level,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return NextResponse.json({
            _id: result.insertedId.toString(),
            name,
            email,
            status: 'active',
            level,
            createdAt: new Date(),
        });
    } catch (error) {
        console.error('Error creating student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 