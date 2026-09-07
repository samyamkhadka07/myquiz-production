import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "MyQuiz | MEC CEE Preparation", description: "Verified, syllabus-aligned MEC CEE practice and progress tracking." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
