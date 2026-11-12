import type { ApprovalDocType } from "../../src/approval-setting/approval-types";

/**
 * Approval-flow helpers for the document DB integrations (approval-setup ADR-0048): with the type's approval ON a Save
 * is a DRAFT, so a test that needs an approved document sends it to approve first (`submit`, version + 1) and then
 * approves it (version + 1).
 */
type Submittable = { submit(actor: { id: string; name: string | null }, id: string, expectedVersion: number): Promise<{ version: number }> };
type Approvable<R> = Submittable & { approve(actorId: string, id: string, expectedVersion: number): Promise<R> };

/** Sends a saved DRAFT to approve; returns the saved record with the new version. */
export async function submitted<T extends { id: string; version: number }>(service: Submittable, actorId: string, saved: T): Promise<T> {
  const result = await service.submit({ id: actorId, name: "IT Tester" }, saved.id, saved.version);
  return { ...saved, version: result.version };
}

/** DRAFT → PENDING_APPROVAL → APPROVED (two version steps); returns the approve result. */
export async function sendAndApprove<R>(service: Approvable<R>, actorId: string, id: string, version: number): Promise<R> {
  const sent = await service.submit({ id: actorId, name: "IT Tester" }, id, version);
  return service.approve(actorId, id, sent.version);
}

type SettingClient = { approvalSetting: { update(args: unknown): Promise<unknown> } };

/** Sets a type's approval switch directly (tests only; the product path is `approvalSetting.update`). */
export async function setApproval(prisma: SettingClient, type: ApprovalDocType, requireApproval: boolean): Promise<void> {
  await prisma.approvalSetting.update({ where: { type }, data: { requireApproval, version: { increment: 1 }, updatedAt: new Date() } });
}
