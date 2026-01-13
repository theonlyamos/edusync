import { NextResponse, NextRequest } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user role
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        const userRole = userData?.role;

        const { id } = await params;
        const { data: assessment, error: assessErr } = await supabase
            .from('assessments')
            .select('id, createdBy')
            .eq('id', id)
            .maybeSingle();
        if (assessErr) throw assessErr;
        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Check user role and permissions
        if (userRole === 'student') {
            // Students can only see their own results
            const { data: result, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', id)
                .eq('studentId', user.id)
                .maybeSingle();
            if (error) throw error;
            return NextResponse.json(result ?? null);
        } else if (
            userRole === 'teacher' &&
            String(assessment.createdBy) === user.id
        ) {
            // Teachers can see all results for their assessments
            const { data: results, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', id)
                .order('submittedAt', { ascending: false });
            if (error) throw error;

            // Calculate statistics
            const totalSubmissions = results?.length ?? 0;
            const averageScore = totalSubmissions ? (results!.reduce((acc: number, curr: any) => acc + curr.percentage, 0) / totalSubmissions) : 0;
            const passRate = totalSubmissions ? ((results!.filter((r: any) => r.status === 'passed').length / totalSubmissions) * 100) : 0;
            const averageTimeSpent = totalSubmissions ? (results!.reduce((acc: number, curr: any) => acc + curr.timeSpent, 0) / totalSubmissions) : 0;

            return NextResponse.json({
                results,
                statistics: {
                    totalSubmissions,
                    averageScore,
                    passRate,
                    averageTimeSpent
                }
            });
        } else if (userRole === 'admin') {
            // Admins can see all results
            const { data: results, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', id)
                .order('submittedAt', { ascending: false });
            if (error) throw error;

            // Calculate statistics
            const totalSubmissions = results?.length ?? 0;
            const averageScore = totalSubmissions ? (results!.reduce((acc: number, curr: any) => acc + curr.percentage, 0) / totalSubmissions) : 0;
            const passRate = totalSubmissions ? ((results!.filter((r: any) => r.status === 'passed').length / totalSubmissions) * 100) : 0;
            const averageTimeSpent = totalSubmissions ? (results!.reduce((acc: number, curr: any) => acc + curr.timeSpent, 0) / totalSubmissions) : 0;

            return NextResponse.json({
                results,
                statistics: {
                    totalSubmissions,
                    averageScore,
                    passRate,
                    averageTimeSpent
                }
            });
        }

        return NextResponse.json(
            { error: 'Not authorized to view these results' },
            { status: 403 }
        );
    } catch (error: any) {
        console.error('Error fetching assessment results:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assessment results' },
            { status: 500 }
        );
    }
}
