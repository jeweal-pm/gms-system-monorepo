import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "./prisma-client";

@Injectable()
export class PrismaLifecycleService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await prisma.$connect(); }
  async onModuleDestroy() { await prisma.$disconnect(); }
}
