"use client";

import { useEffect, useState } from "react";
import { PartnerDrawer } from "@/features/partner/components/partner-drawer";
import type { PartnerEntity } from "@/features/partner/entity";
import { useDebouncedSearch } from "@/features/partner/hooks";
import { isPermissionDenied, loadErrorMessage } from "../api";
import { CUSTOMER_SEARCH_MAX, type CustomerListItem } from "../contract";
import { useCustomerCache, useCustomerList } from "../hooks";

type CustomersDrawerProps = {
  entity: PartnerEntity;
  open: boolean;
  /** Unfiltered total (header badge). */
  total: number | undefined;
  /** Whether to show the fixed "New ..." draft row (false when the user has no ADD permission). */
  draft: boolean;
  draftSelected: boolean;
  selectedId: string | null;
  onSelectDraft: () => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onClose: () => void;
};

/**
 * C-15 / C-16 (FE-CUS-009): binds the `customer.list` query to the shared Partner drawer
 * (vendor FE-VEN-001). Search is debounced 300 ms; the query key includes the search text.
 */
export function CustomersDrawer({ entity, open, total, draft, draftSelected, selectedId, onSelectDraft, onSelectCustomer, onClose }: CustomersDrawerProps) {
  const [query, setQuery] = useState("");
  const search = useDebouncedSearch(query);
  const list = useCustomerList(search);
  const cache = useCustomerCache();
  const lostAccess = isPermissionDenied(list.error);

  // Permission removed mid-session: re-check so the page guard updates (FE-CUS-004).
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
      maxSearchLength={CUSTOMER_SEARCH_MAX}
      onQueryChange={setQuery}
      list={list}
      loadErrorMessage={loadErrorMessage}
      draft={draft}
      draftSelected={draftSelected}
      selectedId={selectedId}
      onSelectDraft={onSelectDraft}
      onSelectItem={onSelectCustomer}
      onClose={onClose}
    />
  );
}
