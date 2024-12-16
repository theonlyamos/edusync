import { User } from "@/lib/models/User";
import { Student } from "@/lib/models/Student";
import { Teacher } from "@/lib/models/Teacher";
import { Admin } from "@/lib/models/Admin";
import { connectToDatabase } from "@/lib/db";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

interface CreateUserParams {
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
}

interface CreateStudentParams extends CreateUserParams {
    grade: string;
    guardianName?: string;
    guardianContact?: string;
}

interface CreateTeacherParams extends CreateUserParams {
    subjects?: string[];
    grades?: string[];
    qualifications?: string[];
    specializations?: string[];
}

interface CreateAdminParams extends CreateUserParams {
    permissions?: string[];
    isSuperAdmin?: boolean;
}

export async function createStudent(params: CreateStudentParams) {
    await connectToDatabase();
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(params.password, 10);

        // Create user
        const user = await User.create([{
            email: params.email,
            password: hashedPassword,
            name: params.name,
            role: 'student'
        }], { session });

        // Create student record
        const student = await Student.create([{
            userId: user[0]._id,
            grade: params.grade,
            guardianName: params.guardianName,
            guardianContact: params.guardianContact
        }], { session });

        await session.commitTransaction();
        return { user: user[0], student: student[0] };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

export async function createTeacher(params: CreateTeacherParams) {
    await connectToDatabase();

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(params.password, 10);

        // Create user
        const user = await User.create({
            email: params.email,
            password: hashedPassword,
            name: params.name,
            role: 'teacher'
        });

        // Create teacher record
        const teacher = await Teacher.create({
            userId: user._id,
            subjects: params?.subjects || [],
            grades: params?.grades || [],
            qualifications: params?.qualifications || [],
            specializations: params?.specializations || []
        });

        return { user, teacher };
    } catch (error) {
        // If teacher creation fails, delete the user
        if (error && 'user' in error) {
            await User.findByIdAndDelete(error.user._id);
        }
        throw error;
    }
}

export async function createAdmin(params: CreateAdminParams) {
    await connectToDatabase();
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(params.password, 10);

        // Create user
        const user = await User.create([{
            email: params.email,
            password: hashedPassword,
            name: params.name,
            role: 'admin'
        }], { session });

        // Create admin record
        const admin = await Admin.create([{
            userId: user[0]._id,
            permissions: params.permissions || [],
            isSuperAdmin: params.isSuperAdmin || false
        }], { session });

        await session.commitTransaction();
        return { user: user[0], admin: admin[0] };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

export async function getUserDetails(userId: string, role: string) {
    await connectToDatabase();

    const user = await User.findById(userId).lean();
    if (!user) return null;

    let roleDetails = null;
    switch (role) {
        case 'student':
            roleDetails = await Student.findOne({ userId }).lean();
            break;
        case 'teacher':
            roleDetails = await Teacher.findOne({ userId }).lean();
            break;
        case 'admin':
            roleDetails = await Admin.findOne({ userId }).lean();
            break;
    }

    return {
        ...user,
        ...roleDetails
    };
}

export async function updateUserPassword(userId: string, newPassword: string) {
    await connectToDatabase();

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { password: hashedPassword } },
        { new: true }
    ).lean();

    return updatedUser;
}

export async function deactivateUser(userId: string) {
    await connectToDatabase();

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { isActive: false } },
        { new: true }
    ).lean();

    return updatedUser;
}

export async function activateUser(userId: string) {
    await connectToDatabase();

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { isActive: true } },
        { new: true }
    ).lean();

    return updatedUser;
} 