import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { ToolsDisclaimer } from "@/components/ToolsDisclaimer";
import { RiderTool } from "./RiderTool";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).rider;
  return { title: t.metaTitle, description: t.lede };
}

// the rider is read in the browser: nothing is uploaded until a request is sent
export default async function RiderPage() {
  const t = (await getDictionary()).tools;
  return (
    <main>
      <RiderTool />
      <div className="wrap rider-disclaimer">
        <ToolsDisclaimer t={t} compact />
      </div>
    </main>
  );
}
