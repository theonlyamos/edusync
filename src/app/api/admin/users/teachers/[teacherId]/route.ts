import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { User } from '@/lib/models/User';
import { Teacher } from '@/lib/models/Teacher';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { teacherId } = await params;
        await connectToDatabase();

        // Get user details
        const userDoc = await User.findById(teacherId);
        if (!userDoc) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        // Get teacher details
        const teacherDoc = await Teacher.findOne({ userId: teacherId });
        if (!teacherDoc) {
            return NextResponse.json(
                { error: "Teacher details not found" },
                { status: 404 }
            );
        }

        // Convert Mongoose documents to plain objects
        const user = userDoc.toObject();
        const teacher = teacherDoc.toObject();

        // Create a serializable object with all required fields
        const serializedData = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.isActive ? 'active' : 'inactive',
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            userId: teacher.userId.toString(),
            subjects: teacher.subjects || [],
            grades: teacher.grades || [],
            qualifications: teacher.qualifications || [],
            specializations: teacher.specializations || [],
            joinDate: teacher.joinDate.toISOString()
        };

        return NextResponse.json(serializedData);
    } catch (error) {
        console.error('Error fetching teacher:', error);
        return NextResponse.json(
            { error: "Failed to fetch teacher" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await req.json();
        await connectToDatabase();

        // Update user basic info
        const { name, email, subjects, grades, qualifications, specializations, status } = body;

        const { teacherId } = await params;
        const userDoc = await User.findByIdAndUpdate(
            teacherId,
            {
                $set: {
                    name,
                    email,
                    isActive: status === 'active'
                }
            },
            { new: true }
        );

        if (!userDoc) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        // Update teacher specific info
        const teacherDoc = await Teacher.findOneAndUpdate(
            { userId: teacherId },
            {
                $set: {
                    subjects,
                    grades,
                    qualifications,
                    specializations
                }
            },
            { new: true }
        );

        if (!teacherDoc) {
            return NextResponse.json(
                { error: "Teacher details not found" },
                { status: 404 }
            );
        }

        // Convert Mongoose documents to plain objects
        const user = userDoc.toObject();
        const teacher = teacherDoc.toObject();

        // Create a serializable response
        const serializedData = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.isActive ? 'active' : 'inactive',
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            userId: teacher.userId.toString(),
            subjects: teacher.subjects || [],
            grades: teacher.grades || [],
            qualifications: teacher.qualifications || [],
            specializations: teacher.specializations || [],
            joinDate: teacher.joinDate.toISOString()
        };

        return NextResponse.json(serializedData);
    } catch (error) {
        console.error('Error updating teacher:', error);
        return NextResponse.json(
            { error: "Failed to update teacher" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        // Instead of deleting, deactivate the user
        const { teacherId } = await params;
        const userDoc = await User.findByIdAndUpdate(
            teacherId,
            { $set: { isActive: false } },
            { new: true }
        );

        if (!userDoc) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: "Teacher deactivated successfully",
            id: userDoc._id.toString()
        });
    } catch (error) {
        console.error('Error deactivating teacher:', error);
        return NextResponse.json(
            { error: "Failed to deactivate teacher" },
            { status: 500 }
        );
    }
} 