import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { User, IUser } from '@/lib/models/User';
import { Student, IStudent } from '@/lib/models/Student';

// Define an interface for the populated student object
interface IPopulatedStudent extends Omit<IStudent, 'userId'> {
    userId: Omit<IUser, 'password' | 'role'> | null; // userId will be the populated User object (or null)
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params; // This is the User ID
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data, error } = await supabase
            .from('students_view')
            .select('*')
            .eq('id', studentId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return new NextResponse('Student not found', { status: 404 });
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching student data:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();

        // Separate updates for User and Student models
        const userUpdates: { [key: string]: any } = {};
        const studentUpdates: { [key: string]: any } = {};
        const allowedUserUpdates = ['name', 'email', 'isActive']; // Assuming 'status' maps to 'isActive'
        const allowedStudentUpdates = ['grade', 'guardianName', 'guardianContact']; // Assuming 'gradeLevel' maps to 'grade'

        Object.keys(updates).forEach(key => {
            if (allowedUserUpdates.includes(key)) {
                userUpdates[key] = updates[key];
            } else if (key === 'status' && typeof updates.status === 'boolean') { // Map status to isActive
                userUpdates['isActive'] = updates.status;
            } else if (allowedStudentUpdates.includes(key)) {
                studentUpdates[key] = updates[key];
            } else if (key === 'gradeLevel') { // Map gradeLevel to grade
                studentUpdates['grade'] = updates.gradeLevel;
            }
        });

        if (Object.keys(userUpdates).length === 0 && Object.keys(studentUpdates).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        if (Object.keys(userUpdates).length > 0) {
            userUpdates.updatedAt = new Date().toISOString();
            const { error } = await supabase
                .from('users')
                .update(userUpdates)
                .eq('id', studentId)
                .eq('role', 'student');
            if (error) throw error;
        }

        if (Object.keys(studentUpdates).length > 0) {
            studentUpdates.updatedAt = new Date().toISOString();
            const { error } = await supabase
                .from('students')
                .update(studentUpdates)
                .eq('user_id', studentId);
            if (error) throw error;
        }

        const { data, error } = await supabase
            .from('students_view')
            .select('*')
            .eq('id', studentId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return new NextResponse('Student user not found', { status: 404 });
        return NextResponse.json(data);

    } catch (error) {
        console.error('Error updating student:', error);
        // Add specific error handling for duplicate email if necessary
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // If you maintain related data in Supabase, add checks here
        const hasData = false;
        if (hasData) {
            return new NextResponse(
                'Cannot delete student with associated data. Please archive the student instead.',
                { status: 400 }
            );
        }
        const { error: delStudentErr } = await supabase
            .from('students')
            .delete()
            .eq('user_id', studentId);
        if (delStudentErr) throw delStudentErr;

        const { error: delUserErr } = await supabase
            .from('users')
            .delete()
            .eq('id', studentId)
            .eq('role', 'student');
        if (delUserErr) throw delUserErr;

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 