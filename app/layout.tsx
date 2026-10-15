import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareCart",
  description: "Voice-first shopping with a caregiver safety net, on PayPal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
