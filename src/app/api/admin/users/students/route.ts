import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Student } from "@/lib/models/Student";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        await connectToDatabase();

        const studentsWithUserData = await Student.find()
            .populate({
                path: 'userId',
                model: User,
                select: '-password -role'
            })
            .sort({ createdAt: -1 })
            .lean();

        const responseData = studentsWithUserData.map(student => {
            if (!student.userId) {
                console.warn(`User data missing for student record: ${student._id}`);
                return { ...student, user: null };
            }

            const userDetails = student.userId as any;
            return {
                _id: userDetails._id,
                email: userDetails.email,
                name: userDetails.name,
                isActive: userDetails.isActive,
                lastLogin: userDetails.lastLogin,
                studentId: student._id,
                grade: student.grade,
                enrollmentDate: student.enrollmentDate,
                guardianName: student.guardianName,
                guardianContact: student.guardianContact,
                createdAt: userDetails.createdAt,
                updatedAt: userDetails.updatedAt,
            };
        });

        return NextResponse.json(responseData);
    } catch (error) {
        console.error("Error fetching students with user data:", error);
        return NextResponse.json(
            { error: "Failed to fetch students" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name, level: grade } = body;

        await connectToDatabase();

        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return NextResponse.json(
                { error: "Email already exists" },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            email,
            password: hashedPassword,
            name,
            role: "student",
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await Student.create({
            userId: newUser._id,
            grade: grade,
            enrollmentDate: new Date()
        });

        const { password: _, ...userWithoutPassword } = newUser.toObject();

        return NextResponse.json(userWithoutPassword);
    } catch (error) {
        console.error("Error creating student:", error);
        return NextResponse.json(
            { error: "Failed to create student" },
            { status: 500 }
        );
    }
} 