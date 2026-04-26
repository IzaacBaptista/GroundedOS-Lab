import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiRequestError } from "../errors";
import { AuthService } from "./auth.service";

export type LoginRequest = {
  username: string;
  password: string;
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): { accessToken: string; expiresIn: number; user: { userId: string; username: string; roles: string[] } } {
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      throw new ApiRequestError("username and password are required.", 400);
    }

    const session = this.authService.login(body.username, body.password);
    if (!session) {
      throw new ApiRequestError("invalid credentials.", 401);
    }

    const secureCookie = String(process.env.FORCE_HTTPS ?? "false").toLowerCase() === "true";
    const maxAgeMs = Number(process.env.SESSION_MAX_AGE ?? 604800000);

    reply.header(
      "Set-Cookie",
      `groundedos-session=${session.accessToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
        maxAgeMs / 1000
      )}${secureCookie ? "; Secure" : ""}`
    );

    return session;
  }
}
