import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiRequestError } from "../errors";
import { AuthService } from "./auth.service";

export type LoginRequest = {
  username: string;
  password: string;
};

export type RefreshRequest = {
  refreshToken: string;
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { userId: string; username: string; roles: string[] };
  } {
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

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: RefreshRequest): {
    accessToken: string;
    expiresIn: number;
    user: { userId: string; username: string; roles: string[] };
  } {
    if (!body || typeof body.refreshToken !== "string" || body.refreshToken.trim().length === 0) {
      throw new ApiRequestError("refreshToken is required.", 400);
    }

    const refreshed = this.authService.refreshAccessToken(body.refreshToken.trim());
    if (!refreshed) {
      throw new ApiRequestError("invalid refresh token.", 401);
    }

    return refreshed;
  }

  @Post("logout")
  @HttpCode(200)
  logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): { loggedOut: true; tokenRevoked: boolean } {
    const token =
      extractBearerToken(request.headers.authorization) ??
      extractCookieValue(request.headers.cookie, "groundedos-session");

    const tokenRevoked = token ? this.authService.revokeToken(token) : false;
    const secureCookie = String(process.env.FORCE_HTTPS ?? "false").toLowerCase() === "true";

    reply.header(
      "Set-Cookie",
      `groundedos-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie ? "; Secure" : ""}`
    );

    return {
      loggedOut: true,
      tokenRevoked,
    };
  }
}

function extractBearerToken(header?: string | string[]): string | null {
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function extractCookieValue(cookieHeader: string | string[] | undefined, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const cookies = raw.split(";").map((item) => item.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === key) {
      return rest.join("=") || null;
    }
  }

  return null;
}
