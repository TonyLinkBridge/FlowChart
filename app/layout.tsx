import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/* 自托管字体，不走 Google CDN —— 内部工具不该有外部请求，也没有闪字 */
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--rf-font-archivo' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--rf-font-mono' });

export const metadata: Metadata = {
  title: 'Runflow 跑流程',
  description: '别人的流程图画出来给人看，这一张可以跑一遍。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${archivo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
