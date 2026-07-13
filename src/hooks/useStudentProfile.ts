'use client';

import { useQuery } from '@tanstack/react-query';

import { studentProfileQueryKey, type StudentProfile } from '@/lib/student-profile';

export function useStudentProfile(userId?: string | null) {
  return useQuery<StudentProfile>({
    queryKey: studentProfileQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch('/api/students/profile');
      if (!response.ok) throw new Error('Failed to load student profile');
      return response.json();
    },
  });
}
