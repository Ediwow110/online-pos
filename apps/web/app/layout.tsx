import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledgerly | The calm way to run your store",
  description: "Sell, track inventory, and understand your business from one dependable POS.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
