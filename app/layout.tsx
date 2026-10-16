import type { Metadata } from "next";
import { Archivo, Noto_Sans_Devanagari, Outfit, Space_Grotesk, Work_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans", display: "swap" });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["latin", "devanagari"], variable: "--font-noto-devanagari", display: "swap" });
const fonts = [archivo, spaceGrotesk, outfit, workSans, notoDevanagari].map((f) => f.variable).join(" ");

// Runs before paint. A #theme=paper|studio hash overrides the stored choice (for QA screenshots).
const themeScript = `try{var t=(location.hash.match(/theme=(studio|paper)/)||[])[1]||localStorage.getItem("voxlabs-theme");if(t!=="studio"&&t!=="paper")t=matchMedia("(prefers-color-scheme: light)").matches?"paper":"studio";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="studio"}`;

export const metadata: Metadata = { title: "Voxlabs" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-screen overflow-hidden">
        <Nav />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
