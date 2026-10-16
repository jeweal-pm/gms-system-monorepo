"use client";

import { useEffect, useState } from "react";
import { PartnerDrawer } from "@/features/partner/components/partner-drawer";
import type { PartnerEntity } from "@/features/partner/entity";
import { useDebouncedSearch } from "@/features/partner/hooks";
import { isPermissionDenied, loadErrorMessage } from "../api";
import { VENDOR_SEARCH_MAX, type VendorListItem } from "../contract";
import { useVendorCache, useVendorList } from "../hooks";

type VendorsDrawerProps = {
  entity: PartnerEntity;
  open: boolean;
  /** Unfiltered total (header badge). */
  total: number | undefined;
  /** Whether to show the fixed "New ..." draft row (false when the user has no ADD permission). */
  draft: boolean;
  draftSelected: boolean;
  selectedId: string | null;
  onSelectDraft: () => void;
  onSelectVendor: (vendor: VendorListItem) => void;
  onClose: () => void;
};

/**
 * C-11 (FE-VEN-008): binds the vendor list query to the shared Partner drawer. Rows: Name, then
 * Code Name or "No code name" (Q-VEN-04 default), grey dot + "Inactive" for inactive vendors (DV-13).
 * Search is debounced 300 ms; the query key includes the search text.
 */
export function VendorsDrawer({ entity, open, total, draft, draftSelected, selectedId, onSelectDraft, onSelectVendor, onClose }: VendorsDrawerProps) {
  const [query, setQuery] = useState("");
  const search = useDebouncedSearch(query);
  const list = useVendorList(search);
  const cache = useVendorCache();
  const lostAccess = isPermissionDenied(list.error);

  // Permission removed mid-session: re-check so the page guard updates (FE-VEN-011).
  useEffect(() => {
    if (lostAccess) void cache.recheckAccess();
  }, [cache, lostAccess]);

  return (
    <PartnerDrawer
      entity={entity}
      open={open}
      total={total}
      query={query}
      search={search}
      maxSearchLength={VENDOR_SEARCH_MAX}
      onQueryChange={setQuery}
      list={list}
      loadErrorMessage={loadErrorMessage}
      draft={draft}
      draftSelected={draftSelected}
      selectedId={selectedId}
      onSelectDraft={onSelectDraft}
      onSelectItem={onSelectVendor}
      onClose={onClose}
    />
  );
}
