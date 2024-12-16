import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Grade } from "@/lib/models/Grade";

export async function GET(
    request: Request,
    { params }: { params: { level: string } }
) {
    try {
        await connectToDatabase();

        const { level } = await params;

        const grade = await Grade.findOne({ level: level })
            .populate('teachers', '-password')
            .populate('students', '-password')
            .lean();

        if (!grade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(grade);
    } catch (error) {
        console.error("Error fetching grade:", error);
        return NextResponse.json(
            { error: "Failed to fetch grade" },
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
        await connectToDatabase();

        const updatedGrade = await Grade.findOneAndUpdate(
            { level: params.level },
            { $set: body },
            { new: true }
        )
            .populate('teachers', '-password')
            .populate('students', '-password')
            .lean();

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedGrade);
    } catch (error) {
        console.error("Error updating grade:", error);
        return NextResponse.json(
            { error: "Failed to update grade" },
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

        const deletedGrade = await Grade.findOneAndDelete({ level: params.level }).lean();

        if (!deletedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Grade deleted successfully" });
    } catch (error) {
        console.error("Error deleting grade:", error);
        return NextResponse.json(
            { error: "Failed to delete grade" },
            { status: 500 }
        );
    }
} 