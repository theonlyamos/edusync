import mongoose from 'mongoose';

export interface ITeacher {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    subjects?: string[];
    grades?: string[];
    qualifications?: string[];
    specializations?: string[];
    joinDate: Date;
    createdAt: Date;
    updatedAt: Date;
}

const teacherSchema = new mongoose.Schema<ITeacher>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        subjects: [{
            type: String,
            required: false
        }],
        grades: [{
            type: String,
            ref: 'Grade',
            required: false
        }],
        qualifications: [{
            type: String
        }],
        specializations: [{
            type: String
        }],
        joinDate: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

// Create indexes
teacherSchema.index({ userId: 1 }, { unique: true });
teacherSchema.index({ subjects: 1 });
teacherSchema.index({ grades: 1 });

// Add a pre-save hook to ensure the referenced user is a teacher
teacherSchema.pre('save', async function (next) {
    const User = mongoose.model('User');
    const user = await User.findById(this.userId);

    if (!user) {
        throw new Error('Referenced user does not exist');
    }

    if (user.role !== 'teacher') {
        throw new Error('Referenced user must be a teacher');
    }

    next();
});

export const Teacher = mongoose.models.Teacher || mongoose.model<ITeacher>('Teacher', teacherSchema); 