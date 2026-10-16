import './globals.css';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import { QuickActionsProvider } from '@/components/QuickActionsContext';
import { DataProvider } from '@/components/DataContext';
import LockGate from '@/components/LockGate';

export const metadata = {
  title: 'Ipon - Continuous Savings Ledger',
  description: 'Mobile-first cutoff, bill, and wealth tracker.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper text-jade min-h-screen flex flex-col font-sans antialiased selection:bg-gold/30">
        <LockGate>
          <DataProvider>
            <QuickActionsProvider>
              <div className="flex-1 w-full max-w-[480px] mx-auto pb-28 min-h-screen relative shadow-sm border-x border-line bg-paper">
                <AppHeader />
                <main>{children}</main>
              </div>
              <BottomNav />
            </QuickActionsProvider>
          </DataProvider>
        </LockGate>
      </body>
    </html>
  );
}