import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SupabaseAuthProvider } from "../components/providers/SupabaseAuthProvider";
import { Toaster } from "@/components/ui/toaster";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InsyteAI - AI Visual Learning Platform | Interactive Education with Voice & Visualizations",
  description: "Transform learning with AI-powered visual explanations, interactive demos, and voice-guided education. Get personalized tutoring with real-time visualizations, quizzes, and collaborative tools for students and teachers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseAuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </SupabaseAuthProvider>
      </body>
    </html>
  );
}
