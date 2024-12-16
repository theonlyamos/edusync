import mongoose from 'mongoose';

export interface ILesson {
    _id: string;
    title: string;
    description: string;
    subject: string;
    grade: string;
    teacher: string;
    duration: number;
    objectives: string[];
    materials: string[];
    content: Array<{
        type: 'text' | 'video' | 'image' | 'file';
        content: string;
        order: number;
    }>;
    attachments?: Array<{
        name: string;
        url: string;
        type: string;
    }>;
    status: 'draft' | 'published';
    createdAt: Date;
    updatedAt: Date;
}

const contentSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['text', 'video', 'image', 'file']
    },
    content: {
        type: String,
        required: true
    },
    order: {
        type: Number,
        required: true
    }
});

const attachmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    }
});

const lessonSchema = new mongoose.Schema<ILesson>(
    {
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        subject: {
            type: String,
            required: true
        },
        grade: {
            type: String,
            required: true
        },
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        duration: {
            type: Number,
            required: true
        },
        objectives: [{
            type: String,
            required: true
        }],
        materials: [{
            type: String
        }],
        content: [contentSchema],
        attachments: [attachmentSchema],
        status: {
            type: String,
            enum: ['draft', 'published'],
            default: 'draft'
        }
    },
    {
        timestamps: true
    }
);

export const Lesson = mongoose.models.Lesson || mongoose.model<ILesson>('Lesson', lessonSchema); 