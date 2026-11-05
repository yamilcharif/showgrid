import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { RiderTool } from "./RiderTool";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).rider;
  return { title: t.metaTitle, description: t.lede };
}

// the rider is read in the browser: nothing is uploaded until a request is sent
export default function RiderPage() {
  return (
    <main>
      <RiderTool />
    </main>
  );
}
