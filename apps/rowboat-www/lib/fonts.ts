import { Geist_Mono, Inter } from "next/font/google";

import { cn } from "@/lib/utils";

/**
 * Root font variables loaded once in `app/layout.tsx`.
 *
 * Every surface uses Inter for text and Geist Mono for code. The shared
 * `--typeface-sans` and `--typeface-mono` tokens in @oppulence/ui read these
 * variables, so marketing, auth, and product code need no font imports.
 */
const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const fontInter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const fontVariables = cn(fontMono.variable, fontInter.variable);
