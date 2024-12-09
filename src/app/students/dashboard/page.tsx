'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function StudentDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user?.role !== 'student')) {
      router.push('/login');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
          
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Current Lessons Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">My Lessons</h3>
                <p className="mt-2 text-sm text-gray-500">Access your current lessons and materials.</p>
                <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                  View Lessons
                </button>
              </div>
            </div>

            {/* Practice Exercises Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">Practice Exercises</h3>
                <p className="mt-2 text-sm text-gray-500">Generate and solve practice problems.</p>
                <button className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                  Start Practice
                </button>
              </div>
            </div>

            {/* AI Tutor Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">AI Tutor</h3>
                <p className="mt-2 text-sm text-gray-500">Get personalized explanations and help.</p>
                <button className="mt-4 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
                  Ask AI Tutor
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 