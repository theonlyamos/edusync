import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Grade } from '@/lib/models/Grade';

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        await connectToDatabase();

        const grade = await Grade.findOne({ level: params.level })
            .select('timetable.periods')
            .populate('timetable.periods.teacher', 'name')
            .lean();

        if (!grade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(grade.timetable?.periods || []);
    } catch (error) {
        console.error("Error fetching periods:", error);
        return NextResponse.json(
            { error: "Failed to fetch periods" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const body = await request.json();
        await connectToDatabase();

        const updatedGrade = await Grade.findOneAndUpdate(
            { level: params.level },
            { $push: { 'timetable.periods': body } },
            { new: true }
        )
            .select('timetable.periods')
            .populate('timetable.periods.teacher', 'name')
            .lean();

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedGrade.timetable.periods);
    } catch (error) {
        console.error("Error creating period:", error);
        return NextResponse.json(
            { error: "Failed to create period" },
            { status: 500 }
        );
    }
} 