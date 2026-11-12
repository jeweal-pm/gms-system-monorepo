import { z } from "zod";
import { APPROVAL_TYPES, type ApprovalType } from "./approval-types";

/** `approvalSetting.list` takes no filters (`{}` or nothing; strict). */
export const approvalSettingListSchema = z.object({}).strict().optional();

/** `approvalSetting.update` (api-contract): one type's switch at the version the page loaded. */
export const approvalSettingUpdateSchema = z.object({
  type: z.enum(APPROVAL_TYPES),
  requireApproval: z.boolean(),
  expectedVersion: z.number().int().min(1),
}).strict();
export type ApprovalSettingUpdateInput = z.output<typeof approvalSettingUpdateSchema>;

/** Waiting counts are capped (ADR-0048 capacity: ≤ 100 per type; the client shows "100+"). */
export const WAITING_CAP = 100;

export type ApprovalSettingItem = {
  type: ApprovalType;
  requireApproval: boolean;
  /** false for the three future inventory types (row only, not switchable in the UI, Q-AS-04). */
  available: boolean;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
  /** PENDING_APPROVAL + REVISION_REQUESTED (not deleted), capped at 100; null without approval-setup:VIEW. */
  waiting: number | null;
};

export type ApprovalSettingUpdated = Pick<ApprovalSettingItem, "type" | "requireApproval" | "version" | "updatedAt" | "updatedByName">;
