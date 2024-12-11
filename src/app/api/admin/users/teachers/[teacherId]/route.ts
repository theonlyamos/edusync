import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(
    req: Request,
    { params }: { params: { teacherId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const { teacherId } = await params;
        const teacher = await db.collection('users').findOne(
            { _id: new ObjectId(teacherId), role: 'teacher' },
            { projection: { password: 0, role: 0 } }
        );

        if (!teacher) {
            return new NextResponse('Teacher not found', { status: 404 });
        }

        return NextResponse.json({
            ...teacher,
            _id: teacher._id.toString()
        });
    } catch (error) {
        console.error('Error fetching teacher:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { teacherId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const allowedUpdates = ['name', 'email', 'status', 'subjects'];
        const updateData: { [key: string]: any } = {};

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = updates[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        updateData.updatedAt = new Date();

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('users').findOneAndUpdate(
            { _id: new ObjectId(params.teacherId), role: 'teacher' },
            { $set: updateData },
            { returnDocument: 'after', projection: { password: 0, role: 0 } }
        );

        if (!result) {
            return new NextResponse('Teacher not found', { status: 404 });
        }

        return NextResponse.json({
            ...result,
            _id: result._id.toString()
        });
    } catch (error) {
        console.error('Error updating teacher:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { teacherId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Check if teacher has any associated lessons
        const hasLessons = await db.collection('lessons').findOne({
            teacherId: new ObjectId(params.teacherId)
        });

        if (hasLessons) {
            return new NextResponse(
                'Cannot delete teacher with associated lessons. Please reassign or delete the lessons first.',
                { status: 400 }
            );
        }

        const result = await db.collection('users').deleteOne({
            _id: new ObjectId(params.teacherId),
            role: 'teacher'
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Teacher not found', { status: 404 });
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting teacher:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 