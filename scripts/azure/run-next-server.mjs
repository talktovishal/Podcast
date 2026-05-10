#!/usr/bin/env node
import http from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireFromWeb = createRequire(resolve(process.cwd(), "package.json"));
const next = requireFromWeb("next");
const realExit = process.exit.bind(process);
let suppressedCleanExitCount = 0;

process.exit = ((code) => {
  const normalizedCode = typeof code === "number" ? code : 0;
  if (normalizedCode === 0) {
    if (suppressedCleanExitCount === 0) {
      console.warn("[articlepod-web] suppressed clean process.exit from the Next.js runtime");
    }
    suppressedCleanExitCount += 1;
    process.exitCode = 0;
    return undefined;
  }

  return realExit(code);
});

function parsePort(value) {
  if (!value) {
    return 3000;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

const port = parsePort(process.env.PORT);
const hostname = process.env.ARTICLEPOD_WEB_HOST || process.env.HOST || "127.0.0.1";

const app = next({
  dev: false,
  dir: process.cwd(),
  hostname,
  port
});
const handle = app.getRequestHandler();

await app.prepare();

const server = http.createServer((request, response) => {
  handle(request, response);
});
const processKeepalive = setInterval(() => undefined, 60 * 60 * 1000);

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.on("error", (error) => {
  console.error("[articlepod-web] server error", error);
  process.exitCode = 1;
});

server.listen(port, hostname, () => {
  console.log(`[articlepod-web] ready on http://${hostname}:${port}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[articlepod-web] received ${signal}; shutting down`);

  const forceExit = setTimeout(() => {
    console.error("[articlepod-web] graceful shutdown timed out");
    realExit(1);
  }, 30_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      console.error("[articlepod-web] shutdown error", error);
      process.exitCode = 1;
    }

    if (typeof app.close === "function") {
      await app.close();
    }

    clearInterval(processKeepalive);
    clearTimeout(forceExit);
    realExit(process.exitCode ?? 0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
