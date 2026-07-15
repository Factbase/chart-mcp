/// <reference types="@cloudflare/workers-types" />
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import * as Sentry from "@sentry/cloudflare";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp";
import { createServer } from "./server.js";
import { googleHandler } from "./auth-handler.js";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  FACTBASE_OAUTH_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  SENTRY_DSN: string;
  CF_VERSION_METADATA: { id: string; tag: string };
};

function createMcpHandler_(env: Env, ctx: ExecutionContext, route: string) {
  const userId = getMcpAuthContext()?.props?.userId as string | undefined;
  if (userId) Sentry.setUser({ id: userId });

  const server = createServer({
    htmlLoader: async () => {
      const r = await env.ASSETS.fetch("https://assets.local/mcp-app.html");
      return r.text();
    },
    onLog: (entry) => {
      const { tool, status, timestamp, ...rest } = entry;
      ctx.waitUntil(
        env.DB.prepare(
          "INSERT INTO requests (ts, tool, status, meta, user_id) VALUES (?, ?, ?, ?, ?)",
        )
          .bind(timestamp, tool, status, JSON.stringify(rest), userId ?? null)
          .run(),
      );
    },
    userId,
  });

  const instrumentedServer = Sentry.wrapMcpServerWithSentry(server, {
    recordInputs: true,
    recordOutputs: true,
  });
  return createMcpHandler(instrumentedServer, { route });
}

const authApiHandler = {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return createMcpHandler_(env, ctx, "/mcp")(req, env, ctx);
  },
} as ExportedHandler & Required<Pick<ExportedHandler, "fetch">>;

function createOAuthProvider() {
  return new OAuthProvider({
    apiHandler: authApiHandler,
    apiRoute: "/mcp",
    defaultHandler: googleHandler as unknown as ExportedHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    accessTokenTTL: 86400, // 24 hours — reduces re-auth on reconnect cycles
  });
}

let oauthProvider: OAuthProvider | null = null;

function isAuthEnabled(env: Env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.COOKIE_ENCRYPTION_KEY);
}

/**
 * Normalize the `resource` param to origin-only (no trailing slash).
 * mcp-remote sends "http://host:8787/" (trailing slash from URL.href),
 * but OAuthProvider validates audience against protocol://host (no slash).
 * Handles both query params (GET /authorize) and form body (POST /token).
 */
async function normalizeResourceParam(req: Request): Promise<Request> {
  // Query parameter (GET /authorize)
  const reqUrl = new URL(req.url);
  const qResource = reqUrl.searchParams.get("resource");
  if (qResource) {
    reqUrl.searchParams.set("resource", new URL(qResource).origin);
    return new Request(reqUrl, req);
  }
  // Form body (POST /token)
  if (req.method === "POST" && req.headers.get("content-type")?.includes("form-urlencoded")) {
    const body = new URLSearchParams(await req.clone().text());
    const bResource = body.get("resource");
    if (bResource) {
      body.set("resource", new URL(bResource).origin);
      return new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: body.toString(),
      });
    }
  }
  return req;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    release: env.CF_VERSION_METADATA?.id,
    tracesSampleRate: 1.0,
    enableLogs: true,
    sendDefaultPii: true,
    initialScope: { tags: { surface: "worker" } },
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
  }),
  {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const { method, url } = req;
      const path = new URL(url).pathname;

      // Log MCP JSON-RPC method for POST requests
      let rpcMethod: string | undefined;
      if (method === "POST") {
        const cloned = req.clone();
        try {
          const body = await cloned.json() as { method?: string };
          rpcMethod = body.method;
        } catch { /* not JSON */ }
      }

      const sessionId = req.headers.get("mcp-session-id");
      console.log(
        `[mcp] ${method} ${path}${rpcMethod ? ` → ${rpcMethod}` : ""}${sessionId ? ` [session=${sessionId.slice(0, 8)}]` : " [no-session]"}`,
      );

      // Glama ownership claim
      if (path === "/.well-known/glama.json") {
        return Response.json(
          {
            $schema: "https://glama.ai/mcp/schemas/connector.json",
            maintainers: [{ email: "ahmadsoory74@gmail.com" }],
          },
          { headers: { "Cache-Control": "public, max-age=86400" } },
        );
      }

      // Favicon — served for Google's favicon fetcher and browser tabs
      if (path === "/favicon.ico" || path === "/favicon.svg") {
        return new Response(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#000"/><g transform="translate(16 16) scale(1.1) translate(-12 -12)" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5719 14.75C20.8498 13.8832 20.9998 12.9591 20.9998 12C20.9998 10.2423 20.496 8.60233 19.6248 7.21658C19.588 7.23784 19.5454 7.25001 19.4998 7.25001H17.8539C16.968 7.25001 16.2498 7.96819 16.2498 8.85411C16.2498 9.65109 15.7995 10.3797 15.0867 10.7361L15.0061 10.7764C14.3726 11.0931 13.627 11.0931 12.9936 10.7764L12.9129 10.7361C12.2001 10.3797 11.7498 9.65109 11.7498 8.85411C11.7498 7.96819 11.0316 7.25001 10.1457 7.25001H9.99983C8.75719 7.25001 7.74983 6.24265 7.74983 5.00001V4.0647C5.27174 5.3947 3.48867 7.85158 3.08594 10.75H5.99983C7.24247 10.75 8.24983 11.7574 8.24983 13C8.24983 13.9665 9.03333 14.75 9.99983 14.75C11.2425 14.75 12.2498 15.7574 12.2498 17V20.9966C13.4963 20.9626 14.6796 20.6752 15.7498 20.1839V17C15.7498 15.7574 16.7572 14.75 17.9998 14.75H20.5719Z" fill="#fff" fill-opacity="0.15" stroke="none"/><path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"/><path d="M3.5 11H6C7.10457 11 8 11.8954 8 13V13C8 14.1046 8.89543 15V15C11.1046 15 12 15.8954 12 17V20.5"/><path d="M8 4V5C8 6.10457 8.89543 7 10 7H10.1459C11.1699 7 12 7.83011 12 8.8541V8.8541C12 9.55638 12.3968 10.1984 13.0249 10.5125L13.1056 10.5528C13.6686 10.8343 14.3314 10.8343 14.8944 10.5528L14.9751 10.5125C15.6032 10.1984 16 9.55638 16 8.8541V8.8541C16 7.83011 16.8301 7 17.8541 7H19.5"/><path d="M16 19.5V17C16 15.8954 16.8954 15 18 15H20"/></g></svg>`,
          { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } },
        );
      }

      if (isAuthEnabled(env)) {
        // RFC 9728: Protected Resource Metadata — override OAuthProvider's built-in
        // response because it includes the apiRoute path in `resource`, but its own
        // token validation checks audience against origin-only (protocol://host).
        // Only served when auth is on: advertising an authorization server we don't
        // run makes clients hunt for /.well-known/oauth-authorization-server, 404,
        // and fail with empty authorization/token endpoints.
        if (
          path === "/.well-known/oauth-protected-resource" ||
          path === "/.well-known/oauth-protected-resource/mcp"
        ) {
          const origin = new URL(url).origin;
          return Response.json({
            resource: origin,
            authorization_servers: [`${origin}/`],
            bearer_methods_supported: ["header"],
          });
        }

        oauthProvider ??= createOAuthProvider();
        req = await normalizeResourceParam(req);
        return oauthProvider.fetch(req, env, ctx);
      }
      // Unauthenticated fallback
      return createMcpHandler_(env, ctx, "/mcp")(req, env, ctx);
    },
  },
);
