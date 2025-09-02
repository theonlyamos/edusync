import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: assessment, error: assessErr } = await supabase
            .from('assessments')
            .select('id, createdBy')
            .eq('id', params.id)
            .maybeSingle();
        if (assessErr) throw assessErr;
        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Check user role and permissions
        if (session.user.role === 'student') {
            // Students can only see their own results
            const { data: result, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', params.id)
                .eq('studentId', session.user.id)
                .maybeSingle();
            if (error) throw error;
            return NextResponse.json(result ?? null);
        } else if (
            session.user.role === 'teacher' &&
            String(assessment.createdBy) === session.user.id
        ) {
            // Teachers can see all results for their assessments
            const { data: results, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', params.id)
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
        } else if (session.user.role === 'admin') {
            // Admins can see all results
            const { data: results, error } = await supabase
                .from('assessment_results')
                .select('*, student:users(name, email)')
                .eq('assessmentId', params.id)
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