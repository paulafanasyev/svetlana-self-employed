/**
 * Светлана orchestrator (§13):
 *
 *   USER → SVETLANA → INTENT → PLANNER → POLICY → TOOL REGISTRY → EXECUTION
 *        → EVIDENCE → VERIFICATION → RESULT → SVETLANA → USER
 *
 * The loop is bounded (max rounds, max tool calls per turn). Every tool call
 * is persisted to ai_actions with evidence + verified flag; the final answer
 * is assembled from verified results only, so a claim of success always has
 * a DB-backed proof (§14). If everything fails, the user gets an honest
 * FAILED / NOT PROVEN status — never a fake success.
 */
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { chatWithFallback } from './providers.js';
import { toolsForLLM, runTool, getTool } from './tools/index.js';
import { buildSystemPrompt } from './persona.js';
import { computeEmotion, emotionProfile } from './emotion.js';
import { retrieve } from './rag.js';
import { audit } from '../plugins/audit.js';

const MAX_ROUNDS = 6;
const MAX_TOOL_CALLS_PER_TURN = 8;

export async function converse({ userId, message, conversationId = null, approvedTool = null, turnId = nanoid() }) {
  const user = db().prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('user not found');
  const profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

  // Conversation continuity
  let conversation = conversationId
    ? db().prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(conversationId, userId)
    : null;
  if (!conversation) {
    const id = conversationId ?? nanoid();
    db()
      .prepare('INSERT INTO ai_conversations (id, user_id, title) VALUES (?, ?, ?)')
      .run(id, userId, message.slice(0, 60));
    conversation = db().prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id);
  }

  const ctx = {
    userId,
    user,
    profile,
    conversationId: conversation.id,
    turnId,
    approvedTools: approvedTool ? new Set([approvedTool]) : new Set(),
  };

  // Persist the user's message.
  db()
    .prepare('INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(nanoid(), conversation.id, 'user', message);

  const history = loadHistory(conversation.id, 20);
  const tools = toolsForLLM();

  const state = {
    role: 'assistant',
    actions: [],
    hasCitations: false,
    askingQuestion: false,
    confidence: 1,
    pendingRisk: null,
  };

  const persistAction = (record) => {
    const actionId = nanoid();
    db()
      .prepare(`INSERT INTO ai_actions (id, conversation_id, user_id, turn_id, tool, args_json, status, result_json,
                                         evidence, verified, started_at, finished_at, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        actionId, conversation.id, userId, turnId, record.tool,
        JSON.stringify(record.args ?? {}), record.status,
        record.result ? JSON.stringify(record.result) : null,
        JSON.stringify(record.evidence ?? []),
        record.verified ? 1 : 0,
        record.startedAt ? Math.floor(record.startedAt / 1000) : null,
        record.finishedAt ? Math.floor(record.finishedAt / 1000) : null,
        record.error ?? null
      );
    record.id = actionId;
    return actionId;
  };

  const messages = [
    { role: 'system', content: buildSystemPrompt({ profile }) },
    ...history,
    { role: 'user', content: message },
  ];

  let finalContent = '';
  let providerMeta = { provider: null, model: null, tokensIn: 0, tokensOut: 0, costRub: 0 };
  let rounds = 0;
  let toolCallCount = 0;

  try {
    while (rounds < MAX_ROUNDS) {
      rounds++;
      const result = await chatWithFallback({ messages, tools });
      providerMeta = {
        provider: result.provider,
        model: result.model,
        tokensIn: providerMeta.tokensIn + (result.tokensIn ?? 0),
        tokensOut: providerMeta.tokensOut + (result.tokensOut ?? 0),
        costRub: providerMeta.costRub + (result.costRub ?? 0),
      };

      const toolCalls = result.toolCalls ?? [];
      if (result.content) finalContent = result.content;

      if (!toolCalls.length) {
        // Terminal answer.
        if (!finalContent) finalContent = 'Готово.';
        break;
      }

      // Append the assistant turn (with its tool_calls) to the transcript.
      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: toolCalls.map((tc, i) => ({
          id: tc.id ?? `call_${turnId}_${i}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        })),
      });

      for (const tc of toolCalls) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
          const rec = {
            tool: tc.name, args: tc.args, status: 'blocked',
            evidence: [{ kind: 'policy', reason: 'tool call budget exceeded' }],
            verified: false, message: 'Превышен лимит действий за один ход. Продолжим по шагам.',
            startedAt: Date.now(), finishedAt: Date.now(),
          };
          state.actions.push(rec);
          persistAction(rec);
          break;
        }

        const record = await runTool(ctx, tc.name, tc.args);
        state.actions.push(record);
        const actionId = persistAction(record);

        if (record.status === 'succeeded' && record.tool === 'rag.ask') {
          state.hasCitations = true;
          recordRagCitations({ actionId, hits: record.result?.hits ?? [] });
        }
        if (record.needsApproval) state.pendingRisk = 'high';

        // Tool result back to the model.
        messages.push({
          role: 'tool',
          tool_call_id: tc.id ?? `call_${turnId}_${toolCallCount}`,
          name: tc.name,
          content: JSON.stringify({
            status: record.status,
            verified: record.verified,
            result: record.result,
            message: record.message,
            ...(record.needsApproval ? { needsApproval: true } : {}),
          }),
        });
      }

      if (state.pendingRisk) break; // await human approval
      if (state.actions.some((a) => a.status === 'failed')) break;
    }
  } catch (err) {
    // Total AI failure → honest FAILED, no fabricated success.
    finalContent = `Я не смогла обработать запрос: все провайдеры недоступны (${err.message}). Это FAILED — ничего не было выполнено за меня. Попробуйте позже или используйте разделы напрямую.`;
    state.actions.push({
      tool: 'orchestrator', args: { message }, status: 'failed', verified: false,
      evidence: [{ kind: 'provider_failure', message: err.message }],
      error: err.message, message: finalContent,
    });
    persistAction({ tool: 'orchestrator', args: { message }, status: 'failed', result: null,
      evidence: [{ kind: 'provider_failure', message: err.message }], verified: false,
      startedAt: Date.now(), finishedAt: Date.now(), error: err.message });
  }

  // Compose the honest summary when tools ran: statuses come from records.
  const summary = actionSummary(state.actions);
  const content = summary || finalContent;
  state.askingQuestion = /Ответьте на|ответь на вопрос|Укажите|заполните|Подтвердите/i.test(content);
  const emotion = computeEmotion(state);
  const emotionMeta = emotionProfile(emotion);

  const msgId = nanoid();
  db()
    .prepare(`INSERT INTO ai_messages (id, conversation_id, role, content, emotion, provider, model,
                                       tokens_in, tokens_out, cost_rub)
              VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`)
    .run(msgId, conversation.id, content, emotion, providerMeta.provider, providerMeta.model,
      providerMeta.tokensIn, providerMeta.tokensOut, providerMeta.costRub);

  for (const action of state.actions) {
    if (action.tool === 'rag.ask' && action.id) {
      db()
        .prepare('UPDATE rag_citations SET message_id = ? WHERE action_id = ? AND message_id IS NULL')
        .run(msgId, action.id);
    }
  }

  audit({ actorId: userId, action: 'ai_turn', entity: 'ai_message', entityId: msgId,
    detail: { turnId, emotion, actions: state.actions.map((a) => ({ tool: a.tool, status: a.status, verified: a.verified })) } });

  return {
    message_id: msgId,
    conversation_id: conversation.id,
    turn_id: turnId,
    content,
    emotion,
    emotion_meta: emotionMeta,
    actions: state.actions.map((a) => ({
      tool: a.tool,
      status: a.status,
      verified: Boolean(a.verified),
      needs_approval: Boolean(a.needsApproval),
      result: a.result,
      message: a.message,
      error: a.error,
    })),
    provider: providerMeta.provider,
    model: providerMeta.model,
    cost_rub: providerMeta.costRub,
  };
}

function loadHistory(conversationId, limit) {
  const rows = db()
    .prepare(`SELECT role, content FROM ai_messages
              WHERE conversation_id = ? AND role IN ('user','assistant')
              ORDER BY created_at DESC LIMIT ?`)
    .all(conversationId, limit);
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

function actionSummary(actions) {
  if (!actions.length) return '';
  const lines = [];
  for (const a of actions) {
    if (a.status === 'succeeded' && a.verified && a.message) lines.push(`✅ ${a.message}`);
    else if (a.status === 'succeeded' && !a.verified) lines.push(`⚠️ Действие выполнено, но я не смогла его подтвердить: ${a.message ?? a.tool}. Статус: NOT PROVEN.`);
    else if (a.status === 'failed') lines.push(`❌ ${a.message ?? 'Действие не выполнено'}. Статус: FAILED.`);
    else if (a.status === 'blocked') lines.push(a.needsApproval ? `🔐 ${a.message}` : `⛔ ${a.message ?? 'Действие заблокировано'}.`);
    else if (a.message) lines.push(a.message);
  }
  return lines.join('\n\n');
}

function recordRagCitations({ actionId, hits }) {
  const stmt = db()
    .prepare(`INSERT INTO rag_citations (id, action_id, message_id, document_id, chunk_id, quote)
              VALUES (?, ?, NULL, ?, ?, ?)`);
  for (const h of hits.slice(0, 5)) {
    stmt.run(nanoid(), actionId, h.document.id, h.chunk.id, h.quote.slice(0, 500));
  }
}
