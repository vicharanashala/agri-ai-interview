import './globals.css';
import Providers from '@/components/Providers';

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
