import { z } from 'zod';

// Password validation schema
export const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Student creation schema
export const createStudentSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: passwordSchema,
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    level: z.string().min(1, 'Grade level is required'),
});

// Teacher creation schema
export const createTeacherSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: passwordSchema,
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    subjects: z.array(z.string()).min(1, 'At least one subject is required'),
    grades: z.array(z.string()).min(1, 'At least one grade is required'),
    qualifications: z.array(z.string()).optional(),
    specializations: z.array(z.string()).optional(),
});

// Admin creation schema
export const createAdminSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: passwordSchema,
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    permissions: z.array(z.string()).optional(),
    isSuperAdmin: z.boolean().optional(),
});

// Update schemas (without password)
export const updateStudentSchema = z.object({
    email: z.string().email('Invalid email address').optional(),
    name: z.string().min(2).max(100).optional(),
    level: z.string().optional(),
    guardianName: z.string().optional(),
    guardianContact: z.string().optional(),
});

export const updateTeacherSchema = z.object({
    email: z.string().email('Invalid email address').optional(),
    name: z.string().min(2).max(100).optional(),
    subjects: z.array(z.string()).optional(),
    grades: z.array(z.string()).optional(),
    qualifications: z.array(z.string()).optional(),
    specializations: z.array(z.string()).optional(),
});
