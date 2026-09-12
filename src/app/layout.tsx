import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallRadius",
  description:
    "Recall investigation workspace for food co-packers: trace a suspect ingredient through mixing, split batches and rework to candidate holds and shipments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
