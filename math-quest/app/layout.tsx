import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'さんすうクエスト', description: 'かけ算・わり算 まいにちトレーニング' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
