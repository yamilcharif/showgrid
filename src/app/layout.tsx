import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { AppStateProvider } from "@/components/AppState";
import { Header } from "@/components/Header";
import { GearListDrawer } from "@/components/GearListDrawer";
import { Toast } from "@/components/Toast";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://show-grid.com"),
  title: "ShowGrid",
  description:
    "Find gear and crew for live events near you. Rental houses list live inventory from Rentman or Flex; techs and engineers list their skills.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <AppStateProvider>
          <Header />
          {children}
          <footer className="site">
            <div className="wrap">
              <span>
                <b>SHOWGRID</b> · One problem at a time
              </span>
              <span className="mono">show-grid.com</span>
            </div>
          </footer>
          <GearListDrawer />
          <Toast />
        </AppStateProvider>
      </body>
    </html>
  );
}
