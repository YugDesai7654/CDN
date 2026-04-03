import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "CDN Control Center",
  description: "Distributed Edge-Cache & Traffic Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={cn("min-h-screen bg-zinc-950 font-sans antialiased")}>
        {children}
      </body>
    </html>
  );
}
