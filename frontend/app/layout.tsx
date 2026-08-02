import './globals.css';
import Providers from '@/components/Providers';
import IdleTimerWrapper from '@/components/IdleTimerWrapper';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'AI Interview Platform',
  description: 'AI-powered interview platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <IdleTimerWrapper>{children}</IdleTimerWrapper>
        </Providers>
      </body>
    </html>
  );
}