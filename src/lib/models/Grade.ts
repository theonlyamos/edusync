import mongoose from 'mongoose';

export interface IGrade {
    _id: string;
    level: string;
    name: string;
    description?: string;
    subjects: string[];
    teachers: string[];
    students: string[];
    timetable?: {
        periods: Array<{
            _id: string;
            day: string;
            startTime: string;
            endTime: string;
            subject: string;
            teacher: string;
        }>;
    };
    createdAt: Date;
    updatedAt: Date;
}

const periodSchema = new mongoose.Schema({
    day: {
        type: String,
        required: true,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { _id: true });

const gradeSchema = new mongoose.Schema<IGrade>(
    {
        level: {
            type: String,
            required: true,
            unique: true
        },
        name: {
            type: String,
            required: true
        },
        description: {
            type: String
        },
        subjects: [{
            type: String,
            required: true
        }],
        teachers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        students: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        timetable: {
            periods: [periodSchema]
        }
    },
    {
        timestamps: true
    }
);

export const Grade = mongoose.models.Grade || mongoose.model<IGrade>('Grade', gradeSchema); 