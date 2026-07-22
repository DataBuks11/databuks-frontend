import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataBuks — Build Your AI Workforce",
  description:
    "Deploy AI teammates that understand your business, generate qualified leads, automate repetitive work, execute workflows and help your business grow.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
