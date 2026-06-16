import { spawn } from "node:child_process";
import { encodeMessage, McpMessageBuffer } from "../mcp/framing.js";

export class StdioMcpClient {
  constructor({ command, args = [], env = {}, cwd = process.cwd(), timeoutMs = 15_000 }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child = null;
    this.ready = null;
  }

  start() {
    if (this.child) return;

    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.ready = new Promise((resolve, reject) => {
      this.child.once("spawn", resolve);
      this.child.once("error", reject);
    });

    const buffer = new McpMessageBuffer((message) => this.handleMessage(message));
    this.child.stdout.on("data", (chunk) => buffer.push(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    this.child.on("exit", (code, signal) => {
      const error = new Error(`Upstream MCP exited code=${code} signal=${signal}. ${this.stderr}`.trim());
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.child = null;
    });
  }

  async initialize() {
    this.start();
    const result = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "sentinel-flight-recorder",
        version: "0.1.0"
      }
    });
    this.notify("notifications/initialized", {});
    return result;
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    return result.tools ?? [];
  }

  async callTool(name, args = {}) {
    return this.request("tools/call", {
      name,
      arguments: args
    });
  }

  request(method, params = {}) {
    this.start();

    const id = this.nextId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}. stderr=${this.stderr}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });

    this.ready
      .then(() => {
        this.child?.stdin.write(encodeMessage(message));
      })
      .catch((error) => {
        const pending = this.pending.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.reject(error);
        }
      });
    return promise;
  }

  notify(method, params = {}) {
    this.start();
    this.ready.then(() => {
      this.child?.stdin.write(encodeMessage({ jsonrpc: "2.0", method, params }));
    });
  }

  handleMessage(message) {
    if (!Object.prototype.hasOwnProperty.call(message, "id")) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  close() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

export function createUpstreamFromEnv(env = process.env) {
  const command = env.SENTINEL_UPSTREAM_COMMAND;
  if (!command) {
    return null;
  }

  return new StdioMcpClient({
    command,
    args: splitArgs(env.SENTINEL_UPSTREAM_ARGS ?? ""),
    cwd: env.SENTINEL_UPSTREAM_CWD ?? process.cwd(),
    timeoutMs: Number(env.SENTINEL_UPSTREAM_TIMEOUT_MS ?? 15_000)
  });
}

export function createMcpNextTool(client) {
  return async (toolCall) => client.callTool(toolCall.name, toolCall.arguments ?? {});
}

function splitArgs(raw) {
  return raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, "")) ?? [];
}
