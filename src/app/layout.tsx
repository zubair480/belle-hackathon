import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallRadius",
  description:
    "Issue, investigation and reusable-resolution workspace for EV vehicle assembly: purchased and in-house parts, reviewed causes, verified fixes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
