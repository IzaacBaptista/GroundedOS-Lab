/**
 * OIDC / OAuth 2.0 provider service.
 *
 * Implements the Authorization Code flow with PKCE for an initial external
 * OIDC provider (configured via env vars).  Maintains full backward-
 * compatibility with existing local JWT/session auth.
 *
 * Environment variables:
 *   OIDC_PROVIDER_URL   — issuer URL (e.g. https://accounts.google.com)
 *   OIDC_CLIENT_ID      — OAuth client ID
 *   OIDC_CLIENT_SECRET  — OAuth client secret
 *   OIDC_CALLBACK_URL   — redirect URI registered with the provider
 *   OIDC_SCOPES         — space-separated scopes (default: "openid profile email")
 *
 * PKCE, state, and nonce are generated per-request and stored in an
 * in-memory map with a 10-minute TTL.  Swap to Redis for multi-instance.
 */

import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { ApiRequestError } from "../errors";
import { AuthService } from "./auth.service";

export interface OidcConfig {
  providerUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scopes: string;
}

export interface PendingOidcRequest {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface OidcTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { userId: string; username: string; roles: string[] };
}

type OidcDiscoveryDoc = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
};

const PKCE_PENDING_TTL_MS = 10 * 60 * 1_000; // 10 minutes

@Injectable()
export class OidcService {
  private readonly pending = new Map<string, PendingOidcRequest>();
  private discoveryCache: OidcDiscoveryDoc | null = null;

  constructor(private readonly authService: AuthService) {}

  isEnabled(): boolean {
    const enabled = String(process.env.FEATURE_OIDC_PROVIDER ?? "false").toLowerCase() === "true";
    if (!enabled) {
      return false;
    }

    return Boolean(
      process.env.OIDC_PROVIDER_URL?.trim() &&
        process.env.OIDC_CLIENT_ID?.trim() &&
        process.env.OIDC_CLIENT_SECRET?.trim() &&
        process.env.OIDC_CALLBACK_URL?.trim()
    );
  }

  private config(): OidcConfig {
    const providerUrl = process.env.OIDC_PROVIDER_URL?.trim();
    const clientId = process.env.OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
    const callbackUrl = process.env.OIDC_CALLBACK_URL?.trim();

    if (!providerUrl || !clientId || !clientSecret || !callbackUrl) {
      throw new ApiRequestError("OIDC provider is not configured.", 503);
    }

    return {
      providerUrl,
      clientId,
      clientSecret,
      callbackUrl,
      scopes: process.env.OIDC_SCOPES?.trim() || "openid profile email",
    };
  }

  /** Generate the authorization URL + PKCE params and persist the pending request. */
  async buildAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const cfg = this.config();
    const discovery = await this.discover(cfg.providerUrl);

    const state = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    this.pending.set(state, {
      state,
      nonce,
      codeVerifier,
      expiresAt: Date.now() + PKCE_PENDING_TTL_MS,
    });

    // Purge expired pending requests.
    this._purgePending();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.callbackUrl,
      scope: cfg.scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { url: `${discovery.authorization_endpoint}?${params}`, state };
  }

  /**
   * Handle the OAuth callback.  Validates state, exchanges code for tokens,
   * fetches userinfo, and issues internal JWT/session tokens for the user.
   */
  async handleCallback(code: string, state: string): Promise<OidcTokenSet> {
    const pending = this.pending.get(state);

    if (!pending) {
      throw new ApiRequestError("Invalid or expired OAuth state.", 400);
    }

    if (Date.now() > pending.expiresAt) {
      this.pending.delete(state);
      throw new ApiRequestError("OAuth state expired — restart the login flow.", 400);
    }

    this.pending.delete(state);

    const cfg = this.config();
    const discovery = await this.discover(cfg.providerUrl);

    // Exchange authorization code for tokens.
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.callbackUrl,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: pending.codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => "");
      throw new ApiRequestError(`Token exchange failed: ${body.slice(0, 200)}`, 502);
    }

    const tokenJson = await tokenResponse.json() as Record<string, unknown>;
    const providerAccessToken = String(tokenJson.access_token ?? "");

    if (!providerAccessToken) {
      throw new ApiRequestError("No access token in provider response.", 502);
    }

    // Fetch userinfo.
    const userInfoResponse = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${providerAccessToken}` },
    });

    if (!userInfoResponse.ok) {
      throw new ApiRequestError("Failed to fetch userinfo from provider.", 502);
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;
    const externalId = String(userInfo.sub ?? "");
    const email = String(userInfo.email ?? userInfo.preferred_username ?? externalId);

    if (!externalId) {
      throw new ApiRequestError("Provider userinfo missing 'sub' claim.", 502);
    }

    // Upsert the external identity into the local user store.
    const session = await this.authService.loginOrRegisterExternalUser({
      externalId,
      provider: new URL(cfg.providerUrl).hostname,
      email,
      name: typeof userInfo.name === "string" ? userInfo.name : email,
    });

    return session;
  }

  private async discover(providerUrl: string): Promise<OidcDiscoveryDoc> {
    if (this.discoveryCache) return this.discoveryCache;

    const wellKnown = `${providerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const res = await fetch(wellKnown);

    if (!res.ok) {
      throw new ApiRequestError(
        `Failed to fetch OIDC discovery document from ${wellKnown}`,
        502
      );
    }

    this.discoveryCache = await res.json() as OidcDiscoveryDoc;
    return this.discoveryCache;
  }

  private _purgePending(): void {
    const now = Date.now();
    for (const [key, val] of this.pending) {
      if (now > val.expiresAt) this.pending.delete(key);
    }
  }
}
