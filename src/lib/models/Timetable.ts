import mongoose from 'mongoose';

export interface IPeriod {
    id: string;
    startTime: string;
    endTime: string;
}

export interface IScheduleEntry {
    subject: string;
    teacherId: mongoose.Types.ObjectId;
    lessonId: mongoose.Types.ObjectId;
}

export interface IDaySchedule {
    [periodId: string]: IScheduleEntry;
}

export interface ISchedule {
    [day: string]: IDaySchedule;
}

export interface ITimetable {
    _id: mongoose.Types.ObjectId;
    grade: string;
    academicYear: string;
    term: string;
    periods: IPeriod[];
    schedule: ISchedule;
    effectiveFrom: Date;
    effectiveTo?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const periodSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    }
});

const scheduleEntrySchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true
    },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lessonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
        required: true
    }
}, { _id: false });

const dayScheduleSchema = new mongoose.Schema({}, {
    strict: false,
    _id: false
});

const scheduleSchema = new mongoose.Schema({}, {
    strict: false,
    _id: false
});

const timetableSchema = new mongoose.Schema<ITimetable>(
    {
        grade: {
            type: String,
            required: true,
            ref: 'Grade'
        },
        academicYear: {
            type: String,
            required: true
        },
        term: {
            type: String,
            required: true,
            enum: ['First', 'Second', 'Third']
        },
        periods: [periodSchema],
        schedule: {
            type: Map,
            of: {
                type: Map,
                of: scheduleEntrySchema
            }
        },
        effectiveFrom: {
            type: Date,
            required: true,
            default: Date.now
        },
        effectiveTo: {
            type: Date
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Ensure only one active timetable per grade
timetableSchema.pre('save', async function (next) {
    if (this.isActive) {
        await mongoose.model('Timetable').updateMany(
            {
                grade: this.grade,
                _id: { $ne: this._id },
                isActive: true
            },
            {
                $set: { isActive: false }
            }
        );
    }
    next();
});

// Add compound unique index for grade, academicYear and term
timetableSchema.index(
    { grade: 1, academicYear: 1, term: 1 },
    { unique: true }
);

export const Timetable = mongoose.models.Timetable || mongoose.model<ITimetable>('Timetable', timetableSchema); 