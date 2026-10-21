import { HttpException } from "@nestjs/common";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCustomerBodySchema, updateCustomerBodySchema } from "../customer/customer.schemas";
import type { CustomerService } from "../customer/customer.service";
import { createVendorBodySchema, updateVendorBodySchema } from "../vendor/vendor.schemas";
import type { VendorService } from "../vendor/vendor.service";
import { LIST_LIMIT_MAX } from "../common/partner-schemas";
import { requireMasterGrant, type MasterAction, type MasterContext, type MasterMenu } from "./authorization";

// Staged router: do not mount until the auth-owned JWT/view/license context adapter is verified.
const t = initTRPC.context<MasterContext>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const envelope = cause instanceof HttpException ? cause.getResponse() : null;
    const detail = typeof envelope === "object" && envelope !== null && "error" in envelope
      ? (envelope as { error?: { code?: unknown; fieldErrors?: unknown } }).error : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        domainCode: typeof detail?.code === "string" ? detail.code : error.code === "BAD_REQUEST" ? "VALIDATION_ERROR" : error.message,
        fieldErrors: Array.isArray(detail?.fieldErrors) ? detail.fieldErrors : undefined,
      },
    };
  },
});

const idInput = z.object({ id: z.uuid() }).strict();
const listInput = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_MAX),
}).strict();

function toListQuery(input: z.output<typeof listInput>) {
  return {
    ...(input.q ? { q: input.q } : {}),
    ...(input.active === undefined ? {} : { active: String(input.active) as "true" | "false" }),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: input.limit,
  };
}

function mapDomainError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const detail = typeof response === "object" && response !== null && "error" in response
      ? (response as { error?: { code?: unknown } }).error : undefined;
    const domainCode = typeof detail?.code === "string" ? detail.code : "DEPENDENCY_UNAVAILABLE";
    const code = error.getStatus() === 400 ? "BAD_REQUEST" : error.getStatus() === 404 ? "NOT_FOUND"
      : error.getStatus() === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE";
    throw new TRPCError({ code, message: domainCode, cause: error });
  }
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "DEPENDENCY_UNAVAILABLE" });
}

async function domainCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { return mapDomainError(error); }
}

function permitted(menu: MasterMenu, action: MasterAction, mutation = false) {
  return t.procedure.use(({ ctx, next }) => {
    const userId = requireMasterGrant(ctx, menu, action, mutation);
    return next({ ctx: { ...ctx, userId } });
  });
}

export type MasterServices = Pick<{ customer: CustomerService; vendor: VendorService }, "customer" | "vendor">;

/** Direct service calls preserve IDs, transaction behavior and existing partner/stone schemas. */
export function createMasterRouter({ customer, vendor }: MasterServices) {
  return t.router({
    customer: t.router({
      list: permitted("customer", "VIEW").input(listInput).query(({ input }) => domainCall(() => customer.list(toListQuery(input)))),
      get: permitted("customer", "VIEW").input(idInput).query(({ input }) => domainCall(() => customer.get(input.id))),
      options: permitted("customer", "VIEW").query(() => domainCall(() => customer.options())),
      nextCode: permitted("customer", "ADD").query(() => domainCall(() => customer.nextCode())),
      create: permitted("customer", "ADD", true).input(createCustomerBodySchema).mutation(({ ctx, input }) => domainCall(() => customer.create(ctx.userId, input))),
      update: permitted("customer", "EDIT", true).input(updateCustomerBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => customer.update(ctx.userId, id, body));
      }),
      delete: permitted("customer", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => customer.delete(ctx.userId, input.id))),
    }),
    vendor: t.router({
      list: permitted("vendor", "VIEW").input(listInput).query(({ input }) => domainCall(() => vendor.list(toListQuery(input)))),
      get: permitted("vendor", "VIEW").input(idInput).query(({ input }) => domainCall(() => vendor.get(input.id))),
      options: permitted("vendor", "VIEW").query(() => domainCall(() => vendor.options())),
      nextCode: permitted("vendor", "ADD").query(() => domainCall(() => vendor.nextCode())),
      create: permitted("vendor", "ADD", true).input(createVendorBodySchema).mutation(({ ctx, input }) => domainCall(() => vendor.create(ctx.userId, input))),
      update: permitted("vendor", "EDIT", true).input(updateVendorBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => vendor.update(ctx.userId, id, body));
      }),
      delete: permitted("vendor", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => vendor.delete(ctx.userId, input.id))),
    }),
  });
}

export type MasterRouter = ReturnType<typeof createMasterRouter>;
