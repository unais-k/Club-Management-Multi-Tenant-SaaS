import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CourtSide | Find your court",
  description: "Book a court and make time for your best game.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
