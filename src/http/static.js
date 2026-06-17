import { extname, relative, resolve, sep } from "node:path";

export function resolvePublicPath(publicRoot, requestUrl) {
  let pathname;

  try {
    const rawPath = String(requestUrl || "/").split(/[?#]/, 1)[0] || "/";
    pathname = decodeURIComponent(rawPath);
  } catch {
    throw httpError(400, "Bad request");
  }

  if (pathname.includes("\0")) {
    throw httpError(400, "Bad request");
  }

  const requestPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const targetPath = resolve(publicRoot, requestPath);
  const relativePath = relative(publicRoot, targetPath);

  if (relativePath === "" || relativePath.startsWith("..") || relativePath.split(sep).includes("..")) {
    throw httpError(404, "Not found");
  }

  return targetPath;
}

export function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
