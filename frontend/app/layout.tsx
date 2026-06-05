import './globals.css';
import Providers from '@/components/Providers';
import IdleTimerWrapper from '@/components/IdleTimerWrapper';

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
      <body>
        <Providers>
          <IdleTimerWrapper>{children}</IdleTimerWrapper>
        </Providers>
      </body>
    </html>
  );
}