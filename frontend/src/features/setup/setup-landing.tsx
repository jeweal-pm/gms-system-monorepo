"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MasterCodeDialog } from "./master-code-dialog";
import { setupLandingTiles } from "./setup-destinations";
import { SetupTileButton, SetupTileLink } from "./setup-tile";

/**
 * Setup landing `/setup` (N-10, S3): centred `<h1>` and four tiles (3 links + the Master Code
 * button that opens the modal). `?dialog=master-code` (context panel "Partner master", revision 2)
 * opens the modal on arrival and is then removed from the URL. Tiles are 144 px wide with a 32 px gap
 * (pitch 176) and wrap to two columns when the content area is narrower than 704 px (FE-NAV-010):
 * 16 px gutters at ≥ md leave 672 px for the row (4 × 144 + 3 × 32); 24 px gutters below md (2 columns).
 */
export function SetupLanding() {
  const router = useRouter();
  const masterCodeRequested = useSearchParams().get("dialog") === "master-code";
  // AppShell mounts this only after the session check, so the parameter is read on the client.
  const [isMasterCodeOpen, setIsMasterCodeOpen] = useState(masterCodeRequested);
  const masterCodeButtonRef = useRef<HTMLButtonElement>(null);

  // Drop the parameter so a reload or Back does not reopen the modal after it was closed.
  useEffect(() => {
    if (masterCodeRequested) router.replace("/setup", { scroll: false });
  }, [masterCodeRequested, router]);

  function closeMasterCode(returnFocus: boolean) {
    setIsMasterCodeOpen(false);
    if (returnFocus) masterCodeButtonRef.current?.focus();
  }

  return (
    <div className="@container px-6 pt-10 pb-12 md:px-4">
      <h1 className="text-center text-gms-title font-semibold text-gms-text">Setup</h1>
      <ul className="mx-auto mt-12 grid w-fit grid-cols-[repeat(2,144px)] gap-x-8 gap-y-6 @min-[672px]:grid-cols-[repeat(4,144px)]">
        {setupLandingTiles.map((tile) => (
          <li key={tile.id}>
            {tile.kind === "link" ? (
              <SetupTileLink variant="landing" href={tile.href} label={tile.label} icon={tile.icon} color={tile.color} />
            ) : (
              <SetupTileButton ref={masterCodeButtonRef} variant="landing" label={tile.label} icon={tile.icon} color={tile.color} onClick={() => setIsMasterCodeOpen(true)} />
            )}
          </li>
        ))}
      </ul>
      <MasterCodeDialog open={isMasterCodeOpen} onClose={closeMasterCode} />
    </div>
  );
}
