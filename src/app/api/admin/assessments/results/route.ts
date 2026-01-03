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
            .from('assessment_results')
            .select(`
                *,
                assessment:assessments(*),
                student:users(name, email)
            `)
            .order('submittedat', { ascending: false });

        if (error) {
            // If table doesn't exist yet, return empty list
            if (error?.code === 'PGRST205') {
                return NextResponse.json([]);
            }
            throw error;
        }

        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching assessment results:', error);
        return NextResponse.json(
            { error: "Failed to fetch assessment results" },
            { status: 500 }
        );
    }
}
