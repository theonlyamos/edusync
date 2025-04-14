import mongoose, { Schema, Document } from 'mongoose';

export interface IProgress extends Document {
  studentId: string;
  lessonId: string;
  completionStatus: number;
  timeSpent: number;
  lastAccessed: Date;
  quizScores: Array<{
    quizId: string;
    score: number;
    attemptDate: Date;
  }>;
}

const ProgressSchema = new Schema({
  studentId: { type: String, required: true },
  lessonId: { type: String, required: true },
  completionStatus: { type: Number, default: 0 },
  timeSpent: { type: Number, default: 0 },
  lastAccessed: { type: Date, default: Date.now },
  quizScores: [{
    quizId: String,
    score: Number,
    attemptDate: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

export const Progress = mongoose.model<IProgress>('Progress', ProgressSchema);