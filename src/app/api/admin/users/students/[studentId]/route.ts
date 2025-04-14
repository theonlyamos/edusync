import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { User, IUser } from '@/lib/models/User';
import { Student, IStudent } from '@/lib/models/Student';

// Define an interface for the populated student object
interface IPopulatedStudent extends Omit<IStudent, 'userId'> {
    userId: Omit<IUser, 'password' | 'role'> | null; // userId will be the populated User object (or null)
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params; // This is the User ID
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await connectToDatabase();

        // Find the Student record by userId and populate the User data
        const studentWithUser = await Student.findOne({ userId: studentId })
            .populate({
                path: 'userId',
                model: User,
                select: '-password -role' // Exclude sensitive fields from User
            })
            .lean<IPopulatedStudent>(); // Use lean with the explicit populated type

        if (!studentWithUser) {
            // No Student record found for this User ID. Check if the User exists alone.
            const userOnly = await User.findOne({ _id: studentId, role: 'student' })
                .select('-password -role')
                .lean<IUser>();
            if (userOnly) {
                console.warn(`Student record not found for existing user ID: ${studentId}`);
                return NextResponse.json({
                    user: userOnly,
                    student: null
                });
            } else {
                return new NextResponse('Student not found', { status: 404 });
            }
        }

        // Check if population succeeded (userId should be an object, not just an ID)
        if (!studentWithUser.userId || typeof studentWithUser.userId !== 'object') {
            console.error(`User population failed for student record: ${studentWithUser._id}. User ID: ${studentId}`);
            // Decide how to handle - return partial data or error?
            // Returning student data without user info for now.
            const { userId, ...studentDataOnly } = studentWithUser;
            return NextResponse.json({ user: null, student: studentDataOnly }, { status: 500 }); // Internal error potentially
        }

        // Now userId is confirmed to be the populated user object
        const userDetails = studentWithUser.userId;

        // Combine data for the response
        const combinedData = {
            // User details (populated)
            _id: userDetails._id,
            email: userDetails.email,
            name: userDetails.name,
            isActive: userDetails.isActive,
            lastLogin: userDetails.lastLogin,
            createdAt: userDetails.createdAt,
            updatedAt: userDetails.updatedAt,
            // Student details
            studentId: studentWithUser._id, // Student document's ID
            grade: studentWithUser.grade,
            enrollmentDate: studentWithUser.enrollmentDate,
            guardianName: studentWithUser.guardianName,
            guardianContact: studentWithUser.guardianContact,
            userId: userDetails._id // Explicitly set userId to User's ID
        };

        return NextResponse.json(combinedData);
    } catch (error) {
        console.error('Error fetching student data:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();

        // Separate updates for User and Student models
        const userUpdates: { [key: string]: any } = {};
        const studentUpdates: { [key: string]: any } = {};
        const allowedUserUpdates = ['name', 'email', 'isActive']; // Assuming 'status' maps to 'isActive'
        const allowedStudentUpdates = ['grade', 'guardianName', 'guardianContact']; // Assuming 'gradeLevel' maps to 'grade'

        Object.keys(updates).forEach(key => {
            if (allowedUserUpdates.includes(key)) {
                userUpdates[key] = updates[key];
            } else if (key === 'status' && typeof updates.status === 'boolean') { // Map status to isActive
                userUpdates['isActive'] = updates.status;
            } else if (allowedStudentUpdates.includes(key)) {
                studentUpdates[key] = updates[key];
            } else if (key === 'gradeLevel') { // Map gradeLevel to grade
                studentUpdates['grade'] = updates.gradeLevel;
            }
        });

        if (Object.keys(userUpdates).length === 0 && Object.keys(studentUpdates).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        await connectToDatabase();

        let updatedUser = null;
        // Update User document if there are user updates
        if (Object.keys(userUpdates).length > 0) {
            userUpdates.updatedAt = new Date(); // Update timestamp
            updatedUser = await User.findByIdAndUpdate(
                studentId,
                { $set: userUpdates },
                { new: true, select: '-password -role' }
            ).lean<IUser>();
            if (!updatedUser) {
                return new NextResponse('Student user not found', { status: 404 });
            }
        }

        let updatedStudentData = null;
        // Update Student document if there are student updates
        if (Object.keys(studentUpdates).length > 0) {
            studentUpdates.updatedAt = new Date(); // Update timestamp
            updatedStudentData = await Student.findOneAndUpdate(
                { userId: studentId },
                { $set: studentUpdates },
                { new: true }
            ).lean<IStudent>();
            if (!updatedStudentData) {
                // Handle case where User exists but Student record doesn't (shouldn't normally happen)
                console.warn(`Student record not found for update, userId: ${studentId}`);
                // Decide if this is an error or just proceed with user update results
            }
        }

        // Fetch the latest data to combine if needed, or construct response from update results
        const finalUserData = updatedUser ?? await User.findById(studentId).select('-password -role').lean<IUser>();
        const finalStudentData = updatedStudentData ?? await Student.findOne({ userId: studentId }).lean<IStudent>();

        if (!finalUserData) { // Should be caught earlier, but double check
            return new NextResponse('Student user not found', { status: 404 });
        }

        const combinedData = {
            ...finalUserData,
            ...(finalStudentData || {}), // Merge student data if found
            _id: finalUserData._id, // Ensure User ID is the primary ID
            userId: finalUserData._id
        };

        return NextResponse.json(combinedData);

    } catch (error) {
        console.error('Error updating student:', error);
        // Add specific error handling for duplicate email if necessary
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await connectToDatabase(); // Ensure connection for the check below

        // Keep native check for submissions for now, requires ObjectId
        // TODO: Refactor if/when a Submission model is available
        const client = await connectToDatabase(); // Re-establish for native client
        const db = client.db();
        const hasData = await db.collection('submissions').findOne({
            studentId: new ObjectId(studentId)
        });

        if (hasData) {
            return new NextResponse(
                'Cannot delete student with associated data. Please archive the student instead.',
                { status: 400 }
            );
        }

        // Delete the Student document first
        const deletedStudent = await Student.findOneAndDelete({ userId: studentId });

        // Then delete the User document
        const deletedUser = await User.findOneAndDelete({ _id: studentId, role: 'student' });

        if (!deletedUser) {
            // If user wasn't found, student potentially wasn't either or was orphaned
            console.warn(`Student user not found for deletion or already deleted: ${studentId}`);
            // If deletedStudent exists but deletedUser doesn't, it implies inconsistent data
            if (deletedStudent) {
                console.error(`Inconsistent data: Found and deleted Student record but no matching User for ID: ${studentId}`);
            }
            return new NextResponse('Student not found', { status: 404 });
        }

        // If user was deleted but student record didn't exist (e.g., previous error)
        if (!deletedStudent) {
            console.warn(`User ${studentId} deleted, but no corresponding Student record found.`);
        }

        return new NextResponse(null, { status: 204 }); // Successfully deleted
    } catch (error) {
        console.error('Error deleting student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 