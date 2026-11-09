import type { Metadata } from "next";
import { Source_Serif_4, Manrope } from "next/font/google";
import { SupabaseAuthProvider } from "../components/providers/SupabaseAuthProvider";
import { Toaster } from "@/components/ui/toaster";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://insyte.vercel.app';
const siteTitle = "InsyteAI - AI Visual Learning Platform | Interactive Education with Voice & Visualizations";
const siteDescription = "Transform learning with AI-powered visual explanations, interactive demos, and voice-guided education. Get personalized tutoring with real-time visualizations, quizzes, and collaborative tools for students and teachers.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: 'website',
    siteName: 'InsyteAI',
    title: siteTitle,
    description: siteDescription,
    images: [{ url: '/hero_image.jpg' }],
  },
  twitter: { card: 'summary_large_image', title: siteTitle, description: siteDescription, images: ['/hero_image.jpg'] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${manrope.className} ${sourceSerif.variable}`}>
        <SupabaseAuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </SupabaseAuthProvider>
      </body>
    </html>
  );
}
