import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Get all teachers (for authenticated users)
export async function GET(request: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const subject = searchParams.get('subject');
        const grade = searchParams.get('grade');

        // Fetch teachers with user info
        let query = supabase
            .from('teachers')
            .select(`
                *,
                user:users!inner(id, name, email, isactive, created_at)
            `)
            .order('created_at', { ascending: false });

        // Filter by subject if provided
        if (subject) {
            query = query.contains('subjects', [subject]);
        }

        // Filter by grade if provided
        if (grade) {
            query = query.contains('grades', [grade]);
        }

        const { data: teachers, error } = await query;

        if (error) throw error;

        // Transform data
        const response = (teachers || []).map((teacher: any) => ({
            id: teacher.id,
            userId: teacher.user_id,
            name: teacher.user?.name || '',
            email: teacher.user?.email || '',
            subjects: teacher.subjects || [],
            grades: teacher.grades || [],
            qualifications: teacher.qualifications || [],
            specializations: teacher.specializations || [],
            joinDate: teacher.joindate,
            isActive: teacher.user?.isactive ?? true,
            createdAt: teacher.created_at,
        }));

        return NextResponse.json(response);
    } catch (error) {
        console.error("Error fetching teachers:", error);
        return NextResponse.json(
            { error: "Failed to fetch teachers" },
            { status: 500 }
        );
    }
}
