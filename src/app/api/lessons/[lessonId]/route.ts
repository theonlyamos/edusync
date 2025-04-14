import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Lesson } from "@/lib/models/Lesson";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        const { lessonId } = await params;

        const lesson = await Lesson.findById(lessonId)
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
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        await connectToDatabase();

        const { lessonId } = await params;

        const lesson = await Lesson.findById(lessonId);

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher' && lesson.teacherId.toString() !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to update this lesson" },
                { status: 403 }
            );
        }

        const updatedLesson = await Lesson.findByIdAndUpdate(
            lessonId,
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
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        const { lessonId } = await params;

        const lesson = await Lesson.findById(lessonId);

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher' && lesson.teacherId.toString() !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to delete this lesson" },
                { status: 403 }
            );
        }

        await Lesson.findByIdAndDelete(lessonId);

        return NextResponse.json({ message: "Lesson deleted successfully" });
    } catch (error) {
        console.error("Error deleting lesson:", error);
        return NextResponse.json(
            { error: "Failed to delete lesson" },
            { status: 500 }
        );
    }
} 