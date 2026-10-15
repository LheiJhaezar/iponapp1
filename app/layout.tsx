import './globals.css';
import BottomNav from '@/components/BottomNav';

export const metadata = {
  title: 'Ipon - Continuous Cutoffs & Savings Tracker',
  description: 'Track pay cutoffs, recurring bills, food, and shared savings goals.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f6f3ea] text-[#143f34] min-h-screen flex flex-col font-sans antialiased selection:bg-[#e2a63f]/30">
        <div className="flex-1 w-full max-w-[480px] mx-auto pb-28 min-h-screen relative shadow-sm border-x border-[#1f5d4c]/10 bg-[#f6f3ea]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}