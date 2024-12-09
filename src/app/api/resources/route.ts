import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';
import { fetchUrlContent } from '@/lib/tavily';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');

        const client = await connectToDatabase();
        const db = client.db();

        // Build query based on parameters
        const query: any = {};
        if (lessonId) {
            query.lessonId = lessonId;
        }

        // Get resources
        const resources = await db.collection('resources')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        // Get all lesson IDs from resources
        const lessonIds = Array.from(new Set(resources.map(r => r.lessonId)));

        // Fetch all relevant lessons in one query
        const lessons = await db.collection('lessons')
            .find({ _id: { $in: lessonIds.map(id => new ObjectId(id)) } })
            .toArray();

        // Create a map of lesson IDs to titles
        const lessonMap = new Map(lessons.map(l => [l._id.toString(), l.title]));

        // Add lesson titles to resources
        const enrichedResources = resources.map(resource => ({
            ...resource,
            lessonTitle: lessonMap.get(resource.lessonId)
        }));

        return NextResponse.json(enrichedResources);
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

        // Verify that the lesson exists
        const lesson = await db.collection('lessons').findOne({
            _id: new ObjectId(data.lessonId)
        });

        if (!lesson) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        let resourceData = {
            ...data,
            lessonId: data.lessonId,
            createdAt: new Date().toISOString(),
            createdBy: session.user.id
        };

        // If it's a URL resource, fetch and save its content
        if (data.type === 'url' && data.url) {
            try {
                const urlContent = await fetchUrlContent(data.url);
                resourceData = {
                    ...resourceData,
                    fileUrl: urlContent.fileUrl,
                    filename: urlContent.filename,
                    originalUrl: urlContent.originalUrl
                };
            } catch (error) {
                console.error('Error fetching URL content:', error);
                return new NextResponse('Failed to fetch URL content', { status: 400 });
            }
        }

        const result = await db.collection('resources').insertOne(resourceData);

        const createdResource = await db.collection('resources').findOne({
            _id: result.insertedId
        });

        // Add lesson title to response
        const enrichedResource = {
            ...createdResource,
            lessonTitle: lesson.title
        };

        return NextResponse.json(enrichedResource);
    } catch (error) {
        console.error('Error creating resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const data = await req.json();
        const { _id, ...updateData } = data;

        // If updating lesson, verify that the new lesson exists
        if (updateData.lessonId) {
            const lesson = await db.collection('lessons').findOne({
                _id: new ObjectId(updateData.lessonId)
            });

            if (!lesson) {
                return new NextResponse('Lesson not found', { status: 404 });
            }
        }

        const result = await db.collection('resources').findOneAndUpdate(
            { _id: new ObjectId(_id) },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!result) {
            return new NextResponse('Resource not found', { status: 404 });
        }

        // Add lesson title to response
        const lesson = await db.collection('lessons').findOne({
            _id: new ObjectId(result.lessonId)
        });

        const enrichedResource = {
            ...result,
            lessonTitle: lesson?.title
        };

        return NextResponse.json(enrichedResource);
    } catch (error) {
        console.error('Error updating resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 