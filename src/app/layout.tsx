import type { Metadata } from "next";
import { DM_Serif_Display, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "InsyteAI - AI Visual Learning Platform | Voice & Live Visualizations",
  description:
    "A voice-first AI tutor that turns complex concepts into live, interactive visualizations. Powered by Google Gemini, ADK, and Vertex AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${manrope.className} ${dmSerif.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
