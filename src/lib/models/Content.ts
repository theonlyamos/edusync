import mongoose, { Schema, Document } from 'mongoose';

// Define possible parent types
const PARENT_TYPES = ['Lesson', 'Quiz', 'Practice', 'Explanation', 'Worksheet', 'Summary'] as const;
type ParentType = typeof PARENT_TYPES[number];

export interface IContent extends Document {
    parentId: mongoose.Types.ObjectId; // Generic parent ID
    parentType: ParentType; // Type of the parent document
    type: string; // Type of this content block (e.g., text, image)
    content: any; // The actual content
    createdAt: Date;
    updatedAt: Date;
}

const contentSchema: Schema = new Schema(
    {
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
            // Note: We can't use `ref` dynamically here in a simple way.
            // If population is needed, it would require logic in the query.
        },
        parentType: {
            type: String,
            required: true,
            enum: PARENT_TYPES,
            index: true,
        },
        type: {
            type: String,
            required: true,
        },
        content: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient querying by parent
contentSchema.index({ parentId: 1, parentType: 1 });

export const Content = mongoose.models.Content || mongoose.model<IContent>('Content', contentSchema); 