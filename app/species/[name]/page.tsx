"use client";

import { useParams } from "next/navigation";
import SpeciesProfile from "@/components/species/SpeciesProfile";

export default function Page() {
  const params = useParams();
  const raw = Array.isArray(params?.name) ? params.name.join("/") : params?.name || "";
  const name = decodeURIComponent(raw);
  return <SpeciesProfile name={name} />;
}
