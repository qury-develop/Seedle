import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seedle",
  description: "小さな「ほしい」を、事業の種にする投稿サービス。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
