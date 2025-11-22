import { Suspense } from "react";
import MobileDashboard from "../components/MobileDashboard";

export default async function HomePage() {
  return (
    <Suspense fallback={null}>
      <MobileDashboard />
    </Suspense>
  );
}
