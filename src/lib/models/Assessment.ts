import mongoose from 'mongoose';

const AssessmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    subject: { type: String, required: true },
    gradeLevel: { type: String, required: true },
    type: {
        type: String,
        enum: ['quiz', 'exam', 'homework'],
        required: true
    },
    duration: { type: Number, required: true }, // in minutes
    totalPoints: { type: Number, required: true },
    passingScore: { type: Number, required: true },
    questions: [{
        question: { type: String, required: true },
        type: {
            type: String,
            enum: ['multiple_choice', 'true_false', 'short_answer'],
            required: true
        },
        options: [String],
        correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
        points: { type: Number, required: true },
        explanation: String
    }],
    dueDate: { type: Date },
    isPublished: { type: Boolean, default: false },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const AssessmentResultSchema = new mongoose.Schema({
    assessmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assessment',
        required: true
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    answers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        answer: { type: mongoose.Schema.Types.Mixed, required: true },
        isCorrect: { type: Boolean, required: true },
        points: { type: Number, required: true }
    }],
    totalScore: { type: Number, required: true },
    percentage: { type: Number, required: true },
    status: {
        type: String,
        enum: ['passed', 'failed'],
        required: true
    },
    startedAt: { type: Date, required: true },
    submittedAt: { type: Date, required: true },
    timeSpent: { type: Number, required: true } // in minutes
});

export const Assessment = mongoose.models.Assessment || mongoose.model('Assessment', AssessmentSchema);
export const AssessmentResult = mongoose.models.AssessmentResult || mongoose.model('AssessmentResult', AssessmentResultSchema); 