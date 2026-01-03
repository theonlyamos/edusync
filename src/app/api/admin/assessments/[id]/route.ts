import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;

        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json(
                { error: "Assessment not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching assessment:', error);
        return NextResponse.json(
            { error: "Failed to fetch assessment" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;
        const body = await req.json();

        const { data, error } = await supabase
            .from('assessments')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json(
                { error: "Assessment not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating assessment:', error);
        return NextResponse.json(
            { error: "Failed to update assessment" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;

        const { error } = await supabase
            .from('assessments')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ message: "Assessment deleted successfully" });
    } catch (error) {
        console.error('Error deleting assessment:', error);
        return NextResponse.json(
            { error: "Failed to delete assessment" },
            { status: 500 }
        );
    }
}
