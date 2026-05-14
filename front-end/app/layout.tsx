import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { RadixDirectionProvider } from '@/components/radix-direction-provider';
import { Navbar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';

const rubik = Rubik({
  variable: '--font-sans',
  subsets: ['hebrew', 'latin'],
});

export const metadata: Metadata = {
  title: {
    template: '%s · יומן משותף',
    default: 'יומן משותף',
  },
  description: 'מצאו זמן פגישה שמתאים לכולם.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={cn('h-full', rubik.variable)}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <RadixDirectionProvider>
            <Navbar />
            <main className="flex flex-1 flex-col">{children}</main>
            <Toaster position="top-center" richColors />
          </RadixDirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
