import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { contentType, resolvePublicPath } from "../src/http/static.js";

const publicRoot = resolve("/tmp/sentinel/public");

test("static resolver serves paths from the public root", () => {
  assert.equal(resolvePublicPath(publicRoot, "/"), resolve(publicRoot, "index.html"));
  assert.equal(resolvePublicPath(publicRoot, "/icon-192.png"), resolve(publicRoot, "icon-192.png"));
  assert.equal(resolvePublicPath(publicRoot, "/brand/sentinel-mark-s.svg"), resolve(publicRoot, "brand/sentinel-mark-s.svg"));
});

test("static resolver blocks path traversal", () => {
  assert.throws(() => resolvePublicPath(publicRoot, "/../package.json"), /Not found/);
  assert.throws(() => resolvePublicPath(publicRoot, "/..%2fpackage.json"), /Not found/);
});

test("static resolver rejects malformed encoded paths", () => {
  assert.throws(() => resolvePublicPath(publicRoot, "/%E0%A4%A"), /Bad request/);
});

test("static content types cover dashboard assets", () => {
  assert.equal(contentType("index.html"), "text/html; charset=utf-8");
  assert.equal(contentType("site.webmanifest"), "application/manifest+json; charset=utf-8");
  assert.equal(contentType("brand/sentinel-mark-s.svg"), "image/svg+xml; charset=utf-8");
  assert.equal(contentType("icon-192.png"), "image/png");
  assert.equal(contentType("favicon.ico"), "image/x-icon");
});
