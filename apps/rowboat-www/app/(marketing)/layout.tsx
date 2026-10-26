import { Suspense } from "react";

import { SupportChat } from "@/components/features/support/support-chat/support-chat";

import { MarketingLayout } from "./marketing-components";

import "./marketing-styles.css";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <MarketingLayout>{children}</MarketingLayout>
      <Suspense fallback={null}>
        <SupportChat />
      </Suspense>
    </div>
  );
}
