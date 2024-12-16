import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Assessment, AssessmentResult } from '@/lib/models/Assessment';
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

        await connectToDatabase();

        const assessment = await Assessment.findById(params.id);
        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Check user role and permissions
        if (session.user.role === 'student') {
            // Students can only see their own results
            const result = await AssessmentResult.findOne({
                assessmentId: params.id,
                studentId: session.user.id
            }).populate('studentId', 'name email');

            return NextResponse.json(result);
        } else if (
            session.user.role === 'teacher' &&
            assessment.createdBy.toString() === session.user.id
        ) {
            // Teachers can see all results for their assessments
            const results = await AssessmentResult.find({
                assessmentId: params.id
            })
                .populate('studentId', 'name email')
                .sort({ submittedAt: -1 });

            // Calculate statistics
            const totalSubmissions = results.length;
            const averageScore = results.reduce((acc, curr) => acc + curr.percentage, 0) / totalSubmissions;
            const passRate = (results.filter(r => r.status === 'passed').length / totalSubmissions) * 100;
            const averageTimeSpent = results.reduce((acc, curr) => acc + curr.timeSpent, 0) / totalSubmissions;

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
            const results = await AssessmentResult.find({
                assessmentId: params.id
            })
                .populate('studentId', 'name email')
                .sort({ submittedAt: -1 });

            // Calculate statistics
            const totalSubmissions = results.length;
            const averageScore = results.reduce((acc, curr) => acc + curr.percentage, 0) / totalSubmissions;
            const passRate = (results.filter(r => r.status === 'passed').length / totalSubmissions) * 100;
            const averageTimeSpent = results.reduce((acc, curr) => acc + curr.timeSpent, 0) / totalSubmissions;

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