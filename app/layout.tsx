import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ipon — your cutoff, tracked",
  description: "Savings by pay cutoff, with buddy accountability.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
