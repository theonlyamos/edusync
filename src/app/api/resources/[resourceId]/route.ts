import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    context: { params: { resourceId: string } }
) {
    const { resourceId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const resource = await db.collection('resources').findOne({
            _id: new ObjectId(resourceId)
        });

        if (!resource) {
            return new NextResponse('Resource not found', { status: 404 });
        }

        return NextResponse.json(resource);
    } catch (error) {
        console.error('Error fetching resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    context: { params: { resourceId: string } }
) {
    const { resourceId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('resources').deleteOne({
            _id: new ObjectId(resourceId)
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Resource not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('Error deleting resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 