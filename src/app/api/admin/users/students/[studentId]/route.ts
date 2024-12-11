import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(
    req: Request,
    { params }: { params: { studentId: string } }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const student = await db.collection('users').findOne(
            { _id: new ObjectId(studentId), role: 'student' },
            { projection: { password: 0, role: 0 } }
        );

        if (!student) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            ...student,
            _id: student._id.toString()
        });
    } catch (error) {
        console.error('Error fetching student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { studentId: string } }
) {
    try {
        const studentId = await params.studentId;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const allowedUpdates = ['name', 'email', 'status', 'gradeLevel'];
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
            { _id: new ObjectId(studentId), role: 'student' },
            { $set: updateData },
            { returnDocument: 'after', projection: { password: 0, role: 0 } }
        );

        if (!result) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            ...result,
            _id: result._id.toString()
        });
    } catch (error) {
        console.error('Error updating student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { studentId: string } }
) {
    try {
        const studentId = await params.studentId;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Check if student has any associated data (e.g., submissions, progress)
        const hasData = await db.collection('submissions').findOne({
            studentId: new ObjectId(studentId)
        });

        if (hasData) {
            return new NextResponse(
                'Cannot delete student with associated data. Please archive the student instead.',
                { status: 400 }
            );
        }

        const result = await db.collection('users').deleteOne({
            _id: new ObjectId(studentId),
            role: 'student'
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 