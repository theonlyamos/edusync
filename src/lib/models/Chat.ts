import mongoose, { Document, Schema, Types } from 'mongoose';

interface IMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    followUpQuestions?: string[];
}

interface IChat extends Document {
    userId: Types.ObjectId;
    lessonId?: Types.ObjectId | null;
    messages: IMessage[];
    title: string;
    createdAt: Date;
    updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
    role: { type: String, required: true, enum: ['user', 'assistant', 'system'] },
    content: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    followUpQuestions: { type: [String], default: undefined }
}, { _id: false }); // Do not create _id for subdocuments

const chatSchema = new Schema<IChat>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Assuming you have a User model
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    messages: { type: [messageSchema], required: true },
    title: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Update updatedAt timestamp before saving
chatSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// If you are frequently querying chats by userId or lessonId, consider adding indexes
chatSchema.index({ userId: 1 });
chatSchema.index({ lessonId: 1 });


const Chat = mongoose.models.Chat || mongoose.model<IChat>('Chat', chatSchema);

export { Chat };
export type { IChat, IMessage }; // Export types if needed elsewhere 