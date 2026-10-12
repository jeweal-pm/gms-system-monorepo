import { Controller, Get, HttpException, HttpStatus, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

@Controller()
export class AppController {
  @Get("health/live")
  live() {
    return { status: "ok" };
  }

  @Get("health/ready")
  async ready() {
    try {
      const response = await fetch(`${process.env.AUTH_SERVICE_URL ?? "http://localhost:3101"}/health/ready`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) throw new Error("auth service unhealthy");
      return { status: "ok", dependencies: { auth: "ok" } };
    } catch {
      throw new HttpException({ status: "not_ready", dependencies: { auth: "unavailable" } }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post("api/v1/users")
  async createUser(@Req() request: Request, @Res() response: Response) {
    return this.forwardToAuth("/api/v1/users", request, response);
  }

  @Put("api/v1/me/password")
  async changePassword(@Req() request: Request, @Res() response: Response) {
    return this.forwardToAuth("/api/v1/me/password", request, response);
  }

  private async forwardToAuth(path: string, request: Request, response: Response) {
    const target = `${process.env.AUTH_SERVICE_URL ?? "http://localhost:3101"}${path}`;
    const headers = new Headers({ "content-type": "application/json" });
    for (const name of ["cookie", "origin", "x-api-key", "user-agent"] as const) {
      const value = request.header(name);
      if (value) headers.set(name, value);
    }
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new HttpException("User service unavailable", HttpStatus.BAD_GATEWAY);
    }
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) response.setHeader("retry-after", retryAfter);
    const cookies = upstream.headers.getSetCookie();
    if (cookies.length > 0) response.setHeader("set-cookie", cookies);
    if (upstream.status === HttpStatus.NO_CONTENT) {
      response.status(HttpStatus.NO_CONTENT).end();
      return;
    }
    response.status(upstream.status).type("application/json").send(await upstream.text());
  }
}
