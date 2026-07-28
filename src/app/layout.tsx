import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Brand Presence Scan",
  description: "One-touch Google visibility audit: Search, Maps, and AI presence with a prioritized action plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
