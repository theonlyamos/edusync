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

        const client = await connectToDatabase();
        const db = client.db();

        let query: any = {};

        if (lessonId) {
            try {
                query.lessonId = lessonId;
            } catch (error) {
                console.error('Invalid lessonId format:', error);
                return new NextResponse('Invalid lessonId', { status: 400 });
            }
        }

        // For teachers, only show their own resources
        if (session.user.role === 'teacher') {
            query.createdBy = session.user.id;
        }

        const resources = await db.collection('resources')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        // Convert ObjectIds to strings in the response
        const serializedResources = resources.map(resource => ({
            ...resource,
            _id: resource._id.toString(),
            lessonId: resource.lessonId.toString()
        }));

        return NextResponse.json(serializedResources);
    } catch (error) {
        console.error('Error fetching resources:', error);
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
        const { lessonId, title, description, type, fileUrl, filename, url, originalUrl } = data;

        let objectIdLessonId;
        try {
            objectIdLessonId = new ObjectId(lessonId);
        } catch (error) {
            console.error('Invalid lessonId format:', error);
            return new NextResponse('Invalid lessonId', { status: 400 });
        }

        const resource = {
            lessonId: objectIdLessonId,
            title,
            description,
            type,
            fileUrl,
            filename,
            url,
            originalUrl,
            createdBy: session.user.id,
            createdAt: new Date().toISOString()
        };

        const result = await db.collection('resources').insertOne(resource);

        // Return the created resource with string IDs
        return NextResponse.json({
            ...resource,
            _id: result.insertedId.toString(),
            lessonId: resource.lessonId.toString()
        });
    } catch (error) {
        console.error('Error creating resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 