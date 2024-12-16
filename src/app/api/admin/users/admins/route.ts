import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { User } from '@/lib/models/User';
import bcrypt from 'bcryptjs';

export async function GET() {
    try {
        await connectToDatabase();
        const admins = await User.find({ role: 'admin' })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json(admins);
    } catch (error) {
        console.error('Error fetching admins:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admins' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        await connectToDatabase();

        // Check if user already exists
        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return NextResponse.json(
                { error: 'Email already exists' },
                { status: 400 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new admin
        const admin = await User.create({
            email,
            password: hashedPassword,
            name,
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Remove password from response
        const { password: _, ...adminWithoutPassword } = admin.toObject();

        return NextResponse.json(adminWithoutPassword);
    } catch (error) {
        console.error('Error creating admin:', error);
        return NextResponse.json(
            { error: 'Failed to create admin' },
            { status: 500 }
        );
    }
} 