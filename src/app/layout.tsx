import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import Nav from "../components/Nav.tsx";
import { DEMO_ROLE_COOKIE, extractDemoRole } from "../server/lib/session.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Application Starter",
  description: "Neutral application baseline",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const currentRole = extractDemoRole(cookieStore.get(DEMO_ROLE_COOKIE)?.value);

  return (
    <html lang="en">
      <body>
        <Nav currentRole={currentRole} />
        {children}
      </body>
    </html>
  );
}
