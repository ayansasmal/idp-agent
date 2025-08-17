import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI-IDP Platform",
  description: "AI-Powered Integrated Developer Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans min-h-screen bg-gray-50 text-gray-900 antialiased`}>
        <Providers>
          <div className="mx-auto max-w-6xl p-4">
            <nav className="mb-8 flex items-center justify-between rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center space-x-4">
                <h1 className="text-xl font-bold text-indigo-600">AI-IDP</h1>
                <span className="text-sm text-gray-500">Integrated Developer Platform</span>
              </div>
              <div className="flex space-x-4">
                <a href="/chat" className="text-sm text-gray-600 hover:text-indigo-600">Chat</a>
                <a href="/approvals" className="text-sm text-gray-600 hover:text-indigo-600">Approvals</a>
              </div>
            </nav>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
