import { Logger } from "@nestjs/common";

/** Keeps test output readable: Nest log lines are not part of the assertions. */
Logger.overrideLogger(false);
