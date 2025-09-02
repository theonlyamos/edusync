import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Create a new assessment
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            title,
            description,
            subject,
            gradeLevel,
            type,
            duration,
            totalPoints,
            passingScore,
            questions,
            dueDate
        } = await req.json();

        const insert = {
            title,
            description,
            subject,
            gradeLevel,
            type,
            duration,
            totalPoints,
            passingScore,
            questions,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            createdBy: session.user.id
        } as any;
        const { data, error } = await supabase
            .from('assessments')
            .insert(insert)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error creating assessment:', error);
        return NextResponse.json(
            { error: 'Failed to create assessment' },
            { status: 500 }
        );
    }
}

// Get all assessments (with filters)
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const subject = searchParams.get('subject');
        const gradeLevel = searchParams.get('gradeLevel');
        const type = searchParams.get('type');
        const isPublished = searchParams.get('isPublished');

        let query = supabase.from('assessments').select('*, createdBy:users(name, email)');
        if (subject) query = query.eq('subject', subject);
        if (gradeLevel) query = query.eq('gradeLevel', gradeLevel);
        if (type) query = query.eq('type', type);
        if (isPublished) query = query.eq('isPublished', isPublished === 'true');
        if (session.user.role === 'teacher') query = query.eq('createdBy', session.user.id);
        const { data, error } = await query.order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error: any) {
        console.error('Error fetching assessments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assessments' },
            { status: 500 }
        );
    }
} 