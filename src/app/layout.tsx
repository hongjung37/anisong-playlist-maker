import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Shippori_Mincho } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const shipporiMincho = Shippori_Mincho({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "AniTune — 애니송 셋리 · 플레이리스트 스튜디오",
  description:
    "작품의 맥락과 OP·ED·삽입곡의 흐름을 짚어 애니송 플레이리스트를 구성하고 YouTube Music과 Spotify 계정에 바로 저장합니다.",
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('anitune_theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${shipporiMincho.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-paper text-ink selection:bg-cobalt/20 selection:text-ink">
        {children}
      </body>
    </html>
  );
}
