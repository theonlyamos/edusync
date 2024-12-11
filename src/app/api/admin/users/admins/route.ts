import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { hash } from 'bcryptjs';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const admins = await db.collection('users')
            .find({ role: 'admin' })
            .project({
                password: 0,
                role: 0,
            })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(admins.map(admin => ({
            ...admin,
            _id: admin._id.toString()
        })));
    } catch (error) {
        console.error('Error fetching admins:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { name, email, password } = await req.json();

        if (!name || !email || !password) {
            return new NextResponse('Missing required fields', { status: 400 });
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
            role: 'admin',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return NextResponse.json({
            _id: result.insertedId.toString(),
            name,
            email,
            status: 'active',
            createdAt: new Date(),
        });
    } catch (error) {
        console.error('Error creating admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 