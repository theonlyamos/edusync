import mongoose from 'mongoose';

export interface IUser {
    _id: mongoose.Types.ObjectId;
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    isActive: boolean;
    lastLogin?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        role: {
            type: String,
            required: true,
            enum: ['admin', 'teacher', 'student']
        },
        isActive: {
            type: Boolean,
            default: true
        },
        lastLogin: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

// Create indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });

export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema); 