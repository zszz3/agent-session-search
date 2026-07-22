import * as fs from "node:fs";
import * as path from "node:path";

export type CodexRequestFidelity = "exact-trace" | "reconstructed" | "normalized";

export interface CodexRequestExport {
  body: Record<string, unknown>;
  fidelity: CodexRequestFidelity;
}

interface TraceCandidate {
  body: Record<string, unknown>;
  timestamp: number;
}

export function resolveCodexResponsesRequest(options: {
  filePath: string;
  rawId: string;
  traceRoot?: string;
}): CodexRequestExport | null {
  const exact = options.traceRoot ? findLatestCodexTraceRequest(options.traceRoot, options.rawId) : null;
  if (exact) return { body: exact, fidelity: "exact-trace" };
  const reconstructed = reconstructCodexResponsesRequest(options.filePath);
  return reconstructed ? { body: reconstructed, fidelity: "reconstructed" } : null;
}

export function findLatestCodexTraceRequest(traceRoot: string, threadId: string): Record<string, unknown> | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(traceRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  let latest: TraceCandidate | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("trace-")) continue;
    const bundlePath = path.join(traceRoot, entry.name);
    const eventLogPath = path.join(bundlePath, "trace.jsonl");
    let lines: string[];
    try {
      lines = fs.readFileSync(eventLogPath, "utf8").split(/\r?\n/);
    } catch {
      continue;
    }

    for (const line of lines) {
      const event = parseObject(line);
      if (!event) continue;
      const payload = objectField(event, "payload");
      if (!payload || payload.type !== "inference_started" || payload.thread_id !== threadId) continue;
      const requestPayload = objectField(payload, "request_payload");
      const relativePath = requestPayload && typeof requestPayload.path === "string" ? requestPayload.path : "";
      const payloadPath = resolveBundlePath(bundlePath, relativePath);
      if (!payloadPath) continue;
      const body = readJsonObject(payloadPath);
      if (!body) continue;
      const timestamp = typeof event.wall_time_unix_ms === "number" ? event.wall_time_unix_ms : 0;
      if (!latest || timestamp >= latest.timestamp) latest = { body, timestamp };
    }
  }
  return latest?.body ?? null;
}

export function reconstructCodexResponsesRequest(filePath: string): Record<string, unknown> | null {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  } catch {
    return null;
  }

  let sessionMeta: Record<string, unknown> | null = null;
  let turnContext: Record<string, unknown> | null = null;
  let input: unknown[] = [];
  for (const line of lines) {
    const row = parseObject(line);
    if (!row) continue;
    const payload = objectField(row, "payload");
    if (row.type === "session_meta" && payload) {
      sessionMeta = payload;
    } else if (row.type === "turn_context" && payload) {
      turnContext = payload;
    } else if (row.type === "response_item" && payload && isRequestInputItem(payload)) {
      input.push(payload);
    } else if (row.type === "compacted" && payload) {
      const replacement = Array.isArray(payload.replacement_history) ? payload.replacement_history : null;
      if (replacement) {
        input = replacement.filter(isRequestInputItem);
      } else if (typeof payload.message === "string" && payload.message.trim()) {
        input = [{ type: "message", role: "assistant", content: [{ type: "output_text", text: payload.message }] }];
      }
    }
  }
  if (!sessionMeta && !turnContext && input.length === 0) return null;

  const model = stringField(turnContext, "model") || "YOUR_MODEL";
  const sessionId = stringField(sessionMeta, "session_id") || stringField(sessionMeta, "id");
  const threadId = stringField(sessionMeta, "id") || sessionId;
  const instructions = baseInstructionsText(sessionMeta?.base_instructions);
  const tools = reconstructedTools(sessionMeta?.dynamic_tools, input);
  const reasoning = reconstructedReasoning(turnContext);
  const clientMetadata: Record<string, string> = {};
  if (sessionId) clientMetadata.session_id = sessionId;
  if (threadId) clientMetadata.thread_id = threadId;
  const turnId = stringField(turnContext, "turn_id");
  if (turnId) clientMetadata.turn_id = turnId;

  return {
    model,
    ...(instructions ? { instructions } : {}),
    input,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    ...(reasoning ? { reasoning } : {}),
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
    ...(sessionId ? { prompt_cache_key: sessionId } : {}),
    ...(Object.keys(clientMetadata).length > 0 ? { client_metadata: clientMetadata } : {}),
  };
}

function reconstructedReasoning(turnContext: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!turnContext) return null;
  const effort = stringField(turnContext, "effort");
  const summary = stringField(turnContext, "summary");
  if (!effort && !summary) return null;
  return { ...(effort ? { effort } : {}), ...(summary && summary !== "none" ? { summary } : {}) };
}

function reconstructedTools(dynamicTools: unknown, input: unknown[]): unknown[] {
  const tools: Record<string, unknown>[] = [];
  const knownNames = new Set<string>();
  for (const raw of Array.isArray(dynamicTools) ? dynamicTools : []) {
    for (const tool of responseToolsFromDynamic(raw)) {
      tools.push(tool);
      if (typeof tool.name === "string") knownNames.add(tool.name);
    }
  }
  for (const item of input) {
    if (!isObject(item) || item.type !== "function_call" || typeof item.name !== "string" || knownNames.has(item.name)) continue;
    knownNames.add(item.name);
    tools.push({
      type: "function",
      name: item.name,
      description: "Reconstructed from recorded tool calls; the original description was not persisted.",
      strict: false,
      parameters: { type: "object", additionalProperties: true },
    });
  }
  return tools;
}

function responseToolsFromDynamic(raw: unknown): Record<string, unknown>[] {
  if (!isObject(raw)) return [];
  const functionSpec = objectField(raw, "Function") ?? objectField(raw, "function");
  if (functionSpec) return [responseFunctionTool(functionSpec)];
  const namespace = objectField(raw, "Namespace") ?? objectField(raw, "namespace");
  if (!namespace) return isDynamicFunction(raw) ? [responseFunctionTool(raw)] : [];
  const namespaceTools = Array.isArray(namespace.tools) ? namespace.tools : [];
  const functions = namespaceTools.flatMap(responseToolsFromDynamic);
  return functions.length > 0
    ? [{ type: "namespace", name: stringField(namespace, "name"), description: stringField(namespace, "description"), tools: functions }]
    : [];
}

function responseFunctionTool(spec: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "function",
    name: stringField(spec, "name"),
    description: stringField(spec, "description"),
    strict: false,
    parameters: spec.inputSchema ?? spec.input_schema ?? { type: "object", additionalProperties: true },
  };
}

function isDynamicFunction(value: Record<string, unknown>): boolean {
  return typeof value.name === "string" && ("inputSchema" in value || "input_schema" in value);
}

function isRequestInputItem(value: unknown): boolean {
  if (!isObject(value) || typeof value.type !== "string") return false;
  return [
    "message",
    "agent_message",
    "reasoning",
    "local_shell_call",
    "function_call",
    "function_call_output",
    "custom_tool_call",
    "custom_tool_call_output",
    "tool_search_call",
    "tool_search_output",
    "web_search_call",
    "image_generation_call",
    "context_compaction",
  ].includes(value.type);
}

function baseInstructionsText(value: unknown): string {
  if (typeof value === "string") return value;
  return stringField(isObject(value) ? value : null, "text");
}

function resolveBundlePath(bundlePath: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const resolvedBundle = path.resolve(bundlePath);
  const resolvedPath = path.resolve(resolvedBundle, relativePath);
  const relative = path.relative(resolvedBundle, resolvedPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolvedPath;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function parseObject(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  return isObject(value) && isObject(value[key]) ? value[key] : null;
}

function stringField(value: Record<string, unknown> | null, key: string): string {
  const field = value?.[key];
  return typeof field === "string" ? field : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
