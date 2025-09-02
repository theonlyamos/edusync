import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { IStudent, Student } from '@/lib/models/Student';
import { IUser, User } from '@/lib/models/User';

interface IPopulatedStudent extends Omit<IStudent, 'userId'> {
    userId: Omit<IUser, 'password' | 'role'> | null; // userId will be the populated User object (or null)
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data: student } = await supabase
            .from('students_view')
            .select('name, email, grade')
            .eq('id', session.user.id)
            .maybeSingle();

        if (!student) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            name: student?.name,
            email: student?.email,
            gradeLevel: (student as any)?.grade || null
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 