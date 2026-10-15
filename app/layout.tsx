import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = { title: "Voxlabs" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden">
        <Nav />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
