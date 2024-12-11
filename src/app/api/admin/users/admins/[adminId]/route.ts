import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(
    req: Request,
    { params }: { params: { adminId: string } }
) {
    try {
        const { adminId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const admin = await db.collection('users').findOne(
            { _id: new ObjectId(adminId), role: 'admin' },
            { projection: { password: 0, role: 0 } }
        );

        if (!admin) {
            return new NextResponse('Admin not found', { status: 404 });
        }

        return NextResponse.json({
            ...admin,
            _id: admin._id.toString()
        });
    } catch (error) {
        console.error('Error fetching admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { adminId: string } }
) {
    try {
        const adminId = await params.adminId;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const allowedUpdates = ['name', 'email', 'status'];
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

        // Check if email is already taken by another user
        if (updateData.email) {
            const existingUser = await db.collection('users').findOne({
                _id: { $ne: new ObjectId(adminId) },
                email: updateData.email
            });

            if (existingUser) {
                return new NextResponse('Email already in use', { status: 400 });
            }
        }

        const result = await db.collection('users').findOneAndUpdate(
            { _id: new ObjectId(adminId), role: 'admin' },
            { $set: updateData },
            { returnDocument: 'after', projection: { password: 0, role: 0 } }
        );

        if (!result) {
            return new NextResponse('Admin not found', { status: 404 });
        }

        return NextResponse.json({
            ...result,
            _id: result._id.toString()
        });
    } catch (error) {
        console.error('Error updating admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { adminId: string } }
) {
    try {
        const adminId = await params.adminId;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Prevent admin from deleting themselves
        if (session.user.id === adminId) {
            return new NextResponse('Cannot delete your own admin account', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('users').deleteOne({
            _id: new ObjectId(adminId),
            role: 'admin'
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Admin not found', { status: 404 });
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 