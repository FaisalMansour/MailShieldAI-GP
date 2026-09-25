import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'MailShield AI · Demo workspace', description: 'A fictional email threat analysis workspace. No real inbox access or security scanning.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
