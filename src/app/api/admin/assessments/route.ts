import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();

        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            // If table doesn't exist yet, return empty list
            if (error?.code === 'PGRST205') {
                return NextResponse.json([]);
            }
            throw error;
        }

        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching assessments:', error);
        return NextResponse.json(
            { error: "Failed to fetch assessments" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const body = await req.json();

        const payload = {
            ...body,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('assessments')
            .insert(payload)
            .select('*')
            .single();

        if (error) throw error;

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating assessment:', error);
        return NextResponse.json(
            { error: "Failed to create assessment" },
            { status: 500 }
        );
    }
}
