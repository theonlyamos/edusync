import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        await connectToDatabase();
        const students = await User.find({ role: "student" })
            .select("-password")
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json(students);
    } catch (error) {
        console.error("Error fetching students:", error);
        return NextResponse.json(
            { error: "Failed to fetch students" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name, grade } = body;

        await connectToDatabase();

        // Check if user already exists
        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return NextResponse.json(
                { error: "Email already exists" },
                { status: 400 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new student
        const student = await User.create({
            email,
            password: hashedPassword,
            name,
            role: "student",
            grade,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Remove password from response
        const { password: _, ...studentWithoutPassword } = student.toObject();

        return NextResponse.json(studentWithoutPassword);
    } catch (error) {
        console.error("Error creating student:", error);
        return NextResponse.json(
            { error: "Failed to create student" },
            { status: 500 }
        );
    }
} 