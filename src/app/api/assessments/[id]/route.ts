import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Assessment } from '@/lib/models/Assessment';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Get a single assessment
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

        const assessment = await Assessment.findById(params.id)
            .populate('createdBy', 'name email');

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
    req: Request,
    { params }: { params: { id: string } }
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

        await connectToDatabase();

        const assessment = await Assessment.findById(params.id);

        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Only allow creator or admin to update
        if (
            assessment.createdBy.toString() !== session.user.id &&
            session.user.role !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'Not authorized to update this assessment' },
                { status: 403 }
            );
        }

        const updatedAssessment = await Assessment.findByIdAndUpdate(
            params.id,
            {
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
                isPublished,
                updatedAt: new Date()
            },
            { new: true }
        ).populate('createdBy', 'name email');

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

        // Only allow creator or admin to delete
        if (
            assessment.createdBy.toString() !== session.user.id &&
            session.user.role !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'Not authorized to delete this assessment' },
                { status: 403 }
            );
        }

        await Assessment.findByIdAndDelete(params.id);

        return NextResponse.json({ message: 'Assessment deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting assessment:', error);
        return NextResponse.json(
            { error: 'Failed to delete assessment' },
            { status: 500 }
        );
    }
} 