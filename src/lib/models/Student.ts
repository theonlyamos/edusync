import mongoose from 'mongoose';

export interface IStudent {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    grade: string;
    enrollmentDate: Date;
    guardianName?: string;
    guardianContact?: string;
    createdAt: Date;
    updatedAt: Date;
}

const studentSchema = new mongoose.Schema<IStudent>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        grade: {
            type: String,
            required: true,
            ref: 'Grade'
        },
        enrollmentDate: {
            type: Date,
            default: Date.now
        },
        guardianName: {
            type: String
        },
        guardianContact: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

// Create indexes
studentSchema.index({ userId: 1 }, { unique: true });
studentSchema.index({ grade: 1 });

// Add a pre-save hook to ensure the referenced user is a student
studentSchema.pre('save', async function (next) {
    const User = mongoose.model('User');
    const user = await User.findById(this.userId);

    if (!user) {
        throw new Error('Referenced user does not exist');
    }

    if (user.role !== 'student') {
        throw new Error('Referenced user must be a student');
    }

    next();
});

export const Student = mongoose.models.Student || mongoose.model<IStudent>('Student', studentSchema); 