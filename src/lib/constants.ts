export const EDUCATION_LEVELS = [
    'primary 1',
    'primary 2',
    'primary 3',
    'primary 4',
    'primary 5',
    'primary 6',
    'jhs 1',
    'jhs 2',
    'jhs 3',
    'shs 1',
    'shs 2',
    'shs 3'
] as const;

export type EducationLevel = typeof EDUCATION_LEVELS[number];

export const SUBJECTS = [
    'Mathematics',
    'English',
    'Science',
    'Social Studies',
    'Art',
    'Music',
    'Physical Education'
] as const;
