"use client";

import { deletedInfo } from "@/features/trade-document/document-api";
import { fromPurchaseOrder, purchaseOrderLoadError, usePurchaseOrderAccess, usePurchaseOrderDetail } from "../api";
import { PurchaseOrderForm } from "./PurchaseOrderForm";

const message = "p-10 text-gms-body text-gms-text-secondary";
const denied = "You don't have permission to view purchase orders.";

/** `/purchase/purchase-order`: no list page yet, so it opens a new purchase order. */
export function NewPurchaseOrderPage() {
  const access = usePurchaseOrderAccess();
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{denied}</p>;
  return <PurchaseOrderForm access={access} />;
}

/** `/purchase/purchase-order/[id]`: a saved purchase order; the form reloads it itself after every write. */
export function EditPurchaseOrderPage({ id }: { id: string }) {
  const access = usePurchaseOrderAccess();
  const detail = usePurchaseOrderDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{denied}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? purchaseOrderLoadError(detail.error) : "This purchase order no longer exists."}</p>;
  return <PurchaseOrderForm key={id} access={access} initial={fromPurchaseOrder(detail.data)} deleted={deletedInfo(detail.data)} />;
}
