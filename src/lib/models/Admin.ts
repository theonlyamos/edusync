import mongoose from 'mongoose';

export interface IAdmin {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    permissions: string[];
    isSuperAdmin: boolean;
    joinDate: Date;
    createdAt: Date;
    updatedAt: Date;
}

const adminSchema = new mongoose.Schema<IAdmin>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        permissions: [{
            type: String,
            enum: [
                'manage_users',
                'manage_content',
                'manage_grades',
                'manage_timetables',
                'manage_assessments',
                'view_analytics',
                'manage_settings'
            ]
        }],
        isSuperAdmin: {
            type: Boolean,
            default: false
        },
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
adminSchema.index({ userId: 1 }, { unique: true });

// Add a pre-save hook to ensure the referenced user is an admin
adminSchema.pre('save', async function (next) {
    const User = mongoose.model('User');
    const user = await User.findById(this.userId);

    if (!user) {
        throw new Error('Referenced user does not exist');
    }

    if (user.role !== 'admin') {
        throw new Error('Referenced user must be an admin');
    }

    // If superadmin, grant all permissions
    if (this.isSuperAdmin) {
        this.permissions = [
            'manage_users',
            'manage_content',
            'manage_grades',
            'manage_timetables',
            'manage_assessments',
            'view_analytics',
            'manage_settings'
        ];
    }

    next();
});

export const Admin = mongoose.models.Admin || mongoose.model<IAdmin>('Admin', adminSchema); 