"use client";
import { useState } from "react";
import type { CatalogPhoto } from "@/lib/catalog";
import LibraryView from "@/components/library/LibraryView";
import RevelaEditor from "@/components/editor/RevelaEditor";

type View = "library" | "develop";

export default function Home() {
  const [view,          setView]         = useState<View>("library");
  const [activePhoto,   setActivePhoto]  = useState<CatalogPhoto | null>(null);

  const openInDevelop = (photo: CatalogPhoto) => {
    setActivePhoto(photo);
    setView("develop");
  };

  if (view === "develop") {
    return (
      <RevelaEditor
        catalogPhoto={activePhoto}
        onBackToLibrary={() => setView("library")}
      />
    );
  }

  return <LibraryView onOpenInDevelop={openInDevelop} />;
}
