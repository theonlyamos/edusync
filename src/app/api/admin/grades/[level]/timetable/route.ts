import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Timetable } from '@/lib/models/Timetable';

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        await connectToDatabase();

        const { level } = await params;

        const timetable = await Timetable.findOne({ grade: level })
            .populate('schedule.*.*.lessonId', 'title subject')
            .populate('schedule.*.*.teacherId', 'name email')
            .lean();

        if (!timetable) {
            return NextResponse.json(
                { error: "Timetable not found" },
            );
        }

        return NextResponse.json(timetable);
    } catch (error) {
        console.error("Error fetching timetable:", error);
        return NextResponse.json(
            { error: "Failed to fetch timetable" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        const body = await request.json();
        const { level } = await params;

        await connectToDatabase();

        const currentYear = new Date().getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const updatedTimetable = await Timetable.findOneAndUpdate(
            { grade: level },
            {
                $set: {
                    ...body,
                    grade: level,
                    academicYear,
                    updatedAt: new Date()
                }
            },
            {
                new: true,
                upsert: true
            }
        )
            .populate('schedule.*.*.teacherId', 'name email')
            .populate('schedule.*.*.lessonId', 'title subject')
            .lean();

        if (!updatedTimetable) {
            return NextResponse.json(
                { error: "Failed to update timetable" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedTimetable);
    } catch (error) {
        console.error("Error updating timetable:", error);
        return NextResponse.json(
            { error: "Failed to update timetable" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        await connectToDatabase();

        const { level } = await params;

        const deletedTimetable = await Timetable.findOneAndDelete({ grade: level }).lean();

        if (!deletedTimetable) {
            return NextResponse.json(
                { error: "Timetable not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Timetable deleted successfully" });
    } catch (error) {
        console.error("Error deleting timetable:", error);
        return NextResponse.json(
            { error: "Failed to delete timetable" },
            { status: 500 }
        );
    }
} 