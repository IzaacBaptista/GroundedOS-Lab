import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuditService } from "../audit/audit.service";
import { getRequestUser } from "../common/auth-context";
import { ApiRequestError } from "../errors";
import { AuthService } from "./auth.service";
import { OidcService } from "./oidc.service";

export type LoginRequest = {
  username: string;
  password: string;
};

export type RefreshRequest = {
  refreshToken: string;
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
    private readonly audit: AuditService
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { userId: string; username: string; roles: string[] };
  }> {
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      throw new ApiRequestError("username and password are required.", 400);
    }

    const session = await this.authService.login(body.username, body.password);
    if (!session) {
      await this.audit.record({
        action: "auth.login.failed",
        resource: "/auth/login",
        metadata: {
          username: body.username,
        },
      });
      throw new ApiRequestError("invalid credentials.", 401);
    }

    setSessionCookie(reply, session.accessToken);

    await this.audit.record({
      userId: session.user.userId,
      username: session.user.username,
      action: "auth.login.succeeded",
      resource: "/auth/login",
    });

    return session;
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { userId: string; username: string; roles: string[] };
  }> {
    if (!body || typeof body.refreshToken !== "string" || body.refreshToken.trim().length === 0) {
      throw new ApiRequestError("refreshToken is required.", 400);
    }

    const refreshed = await this.authService.refreshAccessToken(body.refreshToken.trim());
    if (!refreshed) {
      await this.audit.record({
        action: "auth.refresh.failed",
        resource: "/auth/refresh",
      });
      throw new ApiRequestError("invalid refresh token.", 401);
    }

    setSessionCookie(reply, refreshed.accessToken);

    await this.audit.record({
      userId: refreshed.user.userId,
      username: refreshed.user.username,
      action: "auth.refresh.succeeded",
      resource: "/auth/refresh",
    });

    return refreshed;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{ loggedOut: true; tokenRevoked: boolean }> {
    const requestUser = getRequestUser(request);
    const token =
      extractBearerToken(request.headers.authorization) ??
      extractCookieValue(request.headers.cookie, "groundedos-session");

    const tokenRevoked = token ? await this.authService.revokeToken(token) : false;
    const secureCookie = String(process.env.FORCE_HTTPS ?? "false").toLowerCase() === "true";

    reply.header(
      "Set-Cookie",
      `groundedos-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie ? "; Secure" : ""}`
    );

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "auth.logout",
      resource: "/auth/logout",
      metadata: {
        tokenRevoked,
      },
    });

    return {
      loggedOut: true,
      tokenRevoked,
    };
  }

  @Post("oauth/start")
  @HttpCode(200)
  async oauthStart(): Promise<{ authorizationUrl: string; state: string }> {
    if (!this.oidcService.isEnabled()) {
      throw new ApiRequestError("OIDC provider is not configured.", 503);
    }

    const { url, state } = await this.oidcService.buildAuthorizationUrl();
    return {
      authorizationUrl: url,
      state,
    };
  }

  @Post("oauth/callback")
  @HttpCode(200)
  async oauthCallback(
    @Body() body: { code: string; state: string },
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { userId: string; username: string; roles: string[] };
  }> {
    if (!body || typeof body.code !== "string" || typeof body.state !== "string") {
      throw new ApiRequestError("code and state are required.", 400);
    }

    const session = await this.oidcService.handleCallback(body.code, body.state);
    setSessionCookie(reply, session.accessToken);

    await this.audit.record({
      action: "auth.oauth.success",
      resource: "/auth/oauth/callback",
      metadata: {
        userId: session.user.userId,
        username: session.user.username,
      },
    });

    return session;
  }
}

function setSessionCookie(reply: FastifyReply, accessToken: string): void {
  const secureCookie = String(process.env.FORCE_HTTPS ?? "false").toLowerCase() === "true";
  const maxAgeMs = Number(process.env.SESSION_MAX_AGE ?? 604800000);

  reply.header(
    "Set-Cookie",
    `groundedos-session=${accessToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
      maxAgeMs / 1000
    )}${secureCookie ? "; Secure" : ""}`
  );
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
