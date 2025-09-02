export interface DBUser {
    id: string;
    email: string;
    password?: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface DBStudent {
    id?: string;
    user_id: string;
    grade: string;
    guardianName?: string;
    guardianContact?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface DBTeacher {
    id?: string;
    user_id: string;
    subjects: string[];
    grades: string[];
    qualifications?: string[];
    specializations?: string[];
    joinDate?: string;
}

export interface DBAdmin {
    id?: string;
    user_id: string;
    permissions?: string[];
    isSuperAdmin?: boolean;
}

export interface DBGrade {
    id?: string;
    level: string;
    name: string;
    description?: string;
    subjects: string[];
}

export interface DBPeriod { id: string; day?: string; startTime: string; endTime: string; }

export interface DBTimetable {
    id?: string;
    grade: string;
    academicYear?: string;
    term?: string;
    effectiveFrom?: string;
    isActive?: boolean;
    periods?: DBPeriod[];
    schedule?: Record<string, Record<string, any>>;
}

export interface DBLesson {
    id: string;
    title: string;
    subject: string;
    gradeLevel?: string;
    objectives?: string[];
    content?: string;
    teacher?: string;
    createdAt?: string;
}

export interface DBContent {
    id?: string;
    lesson_id: string;
    type: 'quiz' | 'worksheet' | 'explanation' | 'summary';
    content: any;
    createdAt?: string;
}

export interface DBAssessment {
    id: string;
    title: string;
    description?: string;
    subject: string;
    gradeLevel: string;
    type: string;
    duration: number;
    totalPoints: number;
    passingScore: number;
    questions: any[];
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface DBAssessmentResult {
    id?: string;
    assessmentId: string;
    studentId: string;
    answers: any[];
    score?: number;
    percentage?: number;
    status?: string;
    submittedAt?: string;
    timeSpent?: number;
}

export interface DBChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}

export interface DBChat {
    id?: string;
    userId: string;
    lessonId?: string | null;
    title?: string;
    messages: DBChatMessage[];
    createdAt?: string;
    updatedAt?: string;
}

export interface DBProgress {
    id?: string;
    userId: string;
    lessonId?: string;
    progress: number;
    lastAccessedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}


