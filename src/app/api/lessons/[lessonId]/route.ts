import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Lesson } from "@/lib/models/Lesson";
import { auth } from "@/auth";
import mongoose from "mongoose";

export async function GET(
    request: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        const lesson = await Lesson.findById(params.lessonId)
            .populate('teacher', 'name')
            .lean();

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(lesson);
    } catch (error) {
        console.error("Error fetching lesson:", error);
        return NextResponse.json(
            { error: "Failed to fetch lesson" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'teacher') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        await connectToDatabase();

        const lesson = await Lesson.findById(params.lessonId).lean();

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (lesson.teacher.toString() !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to update this lesson" },
                { status: 403 }
            );
        }

        const updatedLesson = await Lesson.findByIdAndUpdate(
            params.lessonId,
            { $set: body },
            { new: true }
        )
            .populate('teacher', 'name')
            .lean();

        return NextResponse.json(updatedLesson);
    } catch (error) {
        console.error("Error updating lesson:", error);
        return NextResponse.json(
            { error: "Failed to update lesson" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'teacher') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        const lesson = await Lesson.findById(params.lessonId).lean();

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (lesson.teacher.toString() !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to delete this lesson" },
                { status: 403 }
            );
        }

        await Lesson.findByIdAndDelete(params.lessonId);

        return NextResponse.json({ message: "Lesson deleted successfully" });
    } catch (error) {
        console.error("Error deleting lesson:", error);
        return NextResponse.json(
            { error: "Failed to delete lesson" },
            { status: 500 }
        );
    }
} 