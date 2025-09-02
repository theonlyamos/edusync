import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Get a single assessment
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { data: assessment, error } = await supabase
            .from('assessments')
            .select('*, createdBy:users(name, email)')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;

        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(assessment);
    } catch (error: any) {
        console.error('Error fetching assessment:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assessment' },
            { status: 500 }
        );
    }
}

// Update an assessment
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
            dueDate,
            isPublished
        } = await req.json();

        const { id } = await params;
        const { data: assessment, error: findErr } = await supabase
            .from('assessments')
            .select('id, createdBy')
            .eq('id', id)
            .maybeSingle();
        if (findErr) throw findErr;

        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Only allow creator or admin to update
        if (
            String(assessment.createdBy) !== session.user.id &&
            session.user.role !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'Not authorized to update this assessment' },
                { status: 403 }
            );
        }

        const { data: updatedAssessment, error } = await supabase
            .from('assessments')
            .update({
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
                isPublished,
                updatedAt: new Date().toISOString()
            })
            .eq('id', id)
            .select('*, createdBy:users(name, email)')
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json(updatedAssessment);
    } catch (error: any) {
        console.error('Error updating assessment:', error);
        return NextResponse.json(
            { error: 'Failed to update assessment' },
            { status: 500 }
        );
    }
}

// Delete an assessment
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { data: assessment, error: findErr2 } = await supabase
            .from('assessments')
            .select('id, createdBy')
            .eq('id', id)
            .maybeSingle();
        if (findErr2) throw findErr2;

        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Only allow creator or admin to delete
        if (
            String(assessment.createdBy) !== session.user.id &&
            session.user.role !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'Not authorized to delete this assessment' },
                { status: 403 }
            );
        }

        const { error } = await supabase
            .from('assessments')
            .delete()
            .eq('id', id);
        if (error) throw error;

        return NextResponse.json({ message: 'Assessment deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting assessment:', error);
        return NextResponse.json(
            { error: 'Failed to delete assessment' },
            { status: 500 }
        );
    }
} 