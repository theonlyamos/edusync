import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');
        const type = searchParams.get('type');

        const client = await connectToDatabase();
        const db = client.db();

        let query: any = {};

        // Add filters based on parameters
        if (lessonId) {
            query.lessonId = new ObjectId(lessonId);
        }
        if (type) {
            query.type = type;
        }

        // For teachers, only return content they created
        if (session.user.role === 'teacher') {
            query.createdBy = session.user.id;
        }

        const content = await db.collection('lessonContent')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(content);
    } catch (error) {
        console.error('Error fetching content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const data = await req.json();

        const { lessonId, type, content } = data;

        const result = await db.collection('lessonContent').insertOne({
            lessonId: new ObjectId(lessonId),
            type,
            content,
            createdAt: new Date().toISOString(),
            createdBy: session.user.id
        });

        const createdContent = await db.collection('lessonContent').findOne({
            _id: result.insertedId
        });

        return NextResponse.json(createdContent);
    } catch (error) {
        console.error('Error creating content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 