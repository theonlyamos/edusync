import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Grade } from '@/lib/models/Grade';
import mongoose from 'mongoose';

export async function PUT(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const body = await request.json();
        await connectToDatabase();

        const updatedGrade = await Grade.findOneAndUpdate(
            {
                level: params.level,
                'timetable.periods._id': new mongoose.Types.ObjectId(params.periodId)
            },
            {
                $set: {
                    'timetable.periods.$': {
                        _id: new mongoose.Types.ObjectId(params.periodId),
                        ...body
                    }
                }
            },
            { new: true }
        )
            .select('timetable.periods')
            .populate('timetable.periods.teacher', 'name')
            .lean();

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade or period not found" },
                { status: 404 }
            );
        }

        const updatedPeriod = updatedGrade.timetable.periods.find(
            (p: any) => p._id.toString() === params.periodId
        );

        return NextResponse.json(updatedPeriod);
    } catch (error) {
        console.error("Error updating period:", error);
        return NextResponse.json(
            { error: "Failed to update period" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        await connectToDatabase();

        const updatedGrade = await Grade.findOneAndUpdate(
            { level: params.level },
            {
                $pull: {
                    'timetable.periods': {
                        _id: new mongoose.Types.ObjectId(params.periodId)
                    }
                }
            },
            { new: true }
        )
            .select('timetable.periods')
            .lean();

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Period deleted successfully" });
    } catch (error) {
        console.error("Error deleting period:", error);
        return NextResponse.json(
            { error: "Failed to delete period" },
            { status: 500 }
        );
    }
} 