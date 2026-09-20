package com.mirsamopro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mirsamopro.network.ApiClient
import com.mirsamopro.network.AuthApi
import com.mirsamopro.network.ApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Светлана на Android (§13, §14): отправляем сообщение → показываем эмоцию и
 * доказательства по каждому действию (VERIFIED / NOT PROVEN / FAILED).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(onLogout: () -> Unit) {
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var emotion by remember { mutableStateOf("IDLE") }
    var approvingActionId by remember { mutableStateOf<String?>(null) }
    val messages = remember { mutableStateListOf<JSONObject>() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Светлана — $emotion") },
            actions = { IconButton(onClick = onLogout) { Text("⏻") } },
        )
    }) { p ->
        Column(Modifier.fillMaxSize().padding(p).padding(12.dp)) {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                state = listState,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (messages.isEmpty()) {
                    item {
                        Text(
                            "Привет, я Светлана. Могу завести клиента, поставить задачу, " +
                                "найти гранты и ответить по налогам со ссылками на источники.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                items(messages) { m ->
                    ChatBubble(
                        m,
                        onApprove = { actionId ->
                            approvingActionId = actionId
                            scope.launch {
                                try {
                                    val result = withContext(Dispatchers.IO) { AuthApi.approveAction(actionId) }
                                    messages.add(JSONObject()
                                        .put("role", "assistant")
                                        .put("content", result.optString("message", "Результат подтверждённого действия"))
                                        .put("actions", JSONArray().put(result)))
                                    emotion = if (result.optBoolean("verified") && result.optString("status") == "succeeded") "SUCCESS" else "WARNING"
                                } catch (e: Exception) {
                                    messages.add(JSONObject().put("role", "assistant")
                                        .put("content", "FAILED: " + e.message))
                                    emotion = "WARNING"
                                } finally {
                                    approvingActionId = null
                                }
                            }
                        },
                        approvingActionId = approvingActionId,
                    )
                }
                if (busy) item { Text("Светлана думает…", style = MaterialTheme.typography.bodySmall) }
            }

            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = input, onValueChange = { input = it },
                    label = { Text("Сообщение") },
                    modifier = Modifier.weight(1f).heightIn(min = 56.dp, max = 140.dp),
                    enabled = !busy,
                )
                Button(
                    enabled = !busy && input.isNotBlank(),
                    onClick = {
                        val text = input.trim(); input = ""; busy = true; emotion = "THINKING"
                        messages.add(JSONObject().put("role", "user").put("content", text))
                        scope.launch {
                            try {
                                val body = JSONObject().put("message", text)
                                val res = withContext(Dispatchers.IO) { ApiClient.post("/ai/chat", body) }
                                emotion = res.optString("emotion", "IDLE")
                                messages.add(res)
                            } catch (e: ApiException) {
                                emotion = "WARNING"
                                messages.add(JSONObject().put("role", "assistant")
                                    .put("content", "FAILED: ${e.message}"))
                            } catch (e: Exception) {
                                emotion = "WARNING"
                                messages.add(JSONObject().put("role", "assistant")
                                    .put("content", "FAILED: сеть недоступна — ${e.message}"))
                            } finally { busy = false }
                        }
                    },
                ) { Text("→") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatBubble(
    m: JSONObject,
    onApprove: (String) -> Unit,
    approvingActionId: String?,
) {
    val isUser = m.optString("role") == "user"
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Text(if (isUser) "Вы" else "Светлана", style = MaterialTheme.typography.labelSmall)
        Text(
            m.optString("content"),
            style = MaterialTheme.typography.bodyMedium,
            color = if (isUser) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
        )
        // Evidence (§14): statuses come from the backend, never fabricated.
        val actions = m.optJSONArray("actions")
        actions?.let { arr ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (i in 0 until arr.length()) {
                    val a = arr.optJSONObject(i)
                    val label = when {
                        a.optString("status") == "succeeded" && a.optBoolean("verified") -> "✅ VERIFIED"
                        a.optString("status") == "succeeded" -> "⚠️ NOT PROVEN"
                        a.optString("status") == "failed" -> "❌ FAILED"
                        a.optString("status") == "blocked" -> "⛔ BLOCKED"
                        else -> "⏳ PENDING"
                    }
                    AssistChip(onClick = {}, label = { Text(label, style = MaterialTheme.typography.labelSmall) })
                    if (a.optBoolean("needs_approval") && a.optString("id").isNotBlank()) {
                        Button(
                            enabled = approvingActionId != a.optString("id"),
                            onClick = { onApprove(a.optString("id")) },
                        ) {
                            Text(if (approvingActionId == a.optString("id")) "Выполняю…" else "Подтвердить")
                        }
                    }
                }
            }
        }
    }
}
