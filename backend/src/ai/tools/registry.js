/**
 * Tool registry (§13). Светлана acts only through registered tools — every
 * capability is an explicit, audited function, never a free-text claim.
 *
 * Contract per tool:
 *   { name, description, parameters (JSON Schema),
 *     execute(ctx, args) -> { status, result, evidence, message },
 *     verify?(ctx, args, result) -> { verified, evidence } }
 *
 * §14: `verify` re-reads the database (or the external system) to independently
 * prove the effect happened. Without verification the action status is
 * `not_proven` and Светлана is forbidden from claiming success.
 */
const registry = new Map();

export function defineTool(tool) {
  if (registry.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
  registry.set(tool.name, tool);
  return tool;
}

export function getTool(name) {
  return registry.get(name) ?? null;
}

export function listTools() {
  return [...registry.values()];
}

/** JSON-Schema descriptions for providers that support function calling. */
export function toolsForLLM(allowed = null) {
  return listTools()
    .filter((t) => (allowed ? allowed.includes(t.name) : true))
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
}

/**
 * Run a tool end-to-end: execute → verify → record. The returned record is the
 * single source of truth for "did this actually happen".
 */
export async function runTool(ctx, name, args) {
  const tool = getTool(name);
  if (!tool) {
    return {
      tool: name,
      args,
      status: 'failed',
      result: null,
      evidence: [],
      verified: false,
      error: `Инструмент ${name} не существует`,
      message: `Я не умею выполнять действие «${name}».`,
    };
  }

  const record = {
    tool: name,
    args,
    status: 'running',
    result: null,
    evidence: [],
    verified: false,
    error: null,
    message: null,
    startedAt: Date.now(),
  };

  try {
    // Policy engine: sensitive actions (external side effects) need explicit
    // human approval first (§13 POLICY / §33). Without it the action is BLOCKED,
    // never silently skipped.
    if (tool.sensitive && !(ctx.approvedTools instanceof Set && ctx.approvedTools.has(name))) {
      record.status = 'blocked';
      record.needsApproval = true;
      record.message = `Это действие влияет на третьих лиц («${tool.label ?? name}»). Подтвердите выполнение — тогда я его выполню.`;
      record.finishedAt = Date.now();
      return record;
    }
    if (tool.authorize && !tool.authorize(ctx, args)) {
      record.status = 'blocked';
      record.message = 'Действие требует подтверждения или недоступно для вашей учётной записи.';
      record.finishedAt = Date.now();
      return record;
    }
    const out = await tool.execute(ctx, args ?? {});
    record.status = out.status || (out.result ? 'succeeded' : 'not_proven');
    record.result = out.result ?? null;
    record.evidence = out.evidence ?? [];
    record.message = out.message ?? null;
    record.error = out.error ?? null;
  } catch (err) {
    record.status = 'failed';
    record.error = err.message;
    record.message = `Действие не выполнено: ${err.message}`;
  }

  // Independent verification pass (§14). Failure here = NOT PROVEN.
  if (record.status === 'succeeded' && tool.verify) {
    try {
      const v = await tool.verify(ctx, args ?? {}, record.result);
      record.verified = Boolean(v.verified);
      record.evidence = [...record.evidence, ...(v.evidence ?? [])];
      if (!record.verified) record.status = 'not_proven';
    } catch (err) {
      record.verified = false;
      record.status = 'not_proven';
      record.evidence = [...record.evidence, { kind: 'verify_error', message: err.message }];
    }
  } else if (record.status !== 'succeeded') {
    record.verified = false;
  } else {
    // Tools without a verifier can be marked succeeded by their own evidence.
    record.verified = record.evidence.length > 0;
    if (!record.verified) record.status = 'not_proven';
  }

  record.finishedAt = Date.now();
  return record;
}
