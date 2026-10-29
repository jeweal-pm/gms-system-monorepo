"use client";

import { fromMemoReceive, memoReceiveLoadError, useMemoReceiveAccess, useMemoReceiveDetail } from "../api";
import { MemoReceiveForm } from "./MemoReceiveForm";

const message = "p-10 text-gms-body text-gms-text-secondary";
const denied = "You don't have permission to view memo receives.";

/** `/memo/memo-receive`: no list page yet, so it opens a new memo receive. */
export function NewMemoReceivePage() {
  const access = useMemoReceiveAccess();
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{denied}</p>;
  return <MemoReceiveForm access={access} />;
}

/** `/memo/memo-receive/[id]`: a saved memo receive; the form reloads it itself after every write. */
export function EditMemoReceivePage({ id }: { id: string }) {
  const access = useMemoReceiveAccess();
  const detail = useMemoReceiveDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{denied}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoReceiveLoadError(detail.error) : "This Memo Receive no longer exists."}</p>;
  return <MemoReceiveForm key={id} access={access} initial={fromMemoReceive(detail.data)} />;
}
