import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Assessment } from '@/lib/models/Assessment';
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

        await connectToDatabase();

        const assessment = await Assessment.create({
            title,
            description,
            subject,
            gradeLevel,
            type,
            duration,
            totalPoints,
            passingScore,
            questions,
            dueDate: dueDate ? new Date(dueDate) : null,
            createdBy: session.user.id
        });

        return NextResponse.json(assessment);
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

        const query: any = {};
        if (subject) query.subject = subject;
        if (gradeLevel) query.gradeLevel = gradeLevel;
        if (type) query.type = type;
        if (isPublished) query.isPublished = isPublished === 'true';

        // If user is a teacher, only show their created assessments
        if (session.user.role === 'teacher') {
            query.createdBy = session.user.id;
        }

        await connectToDatabase();

        const assessments = await Assessment.find(query)
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        return NextResponse.json(assessments);
    } catch (error: any) {
        console.error('Error fetching assessments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assessments' },
            { status: 500 }
        );
    }
} 