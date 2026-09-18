import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AuthProvider } from "@/components/auth/auth-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"], // latin-ext covers Albanian characters (ë, ç)
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Seigem",
    template: "%s | Seigem",
  },
  description:
    "Seigem kthen materialet e tua PDF, Word dhe PowerPoint në përmbledhje, flashcards dhe kuize.",
  applicationName: "Seigem",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sq" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
