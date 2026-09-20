package com.mirsamopro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mirsamopro.network.ApiClient
import org.json.JSONArray

/** Простые списковые экраны: задачи и клиенты из общего backend. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen() = ListScreen(title = "Задачи", path = "/tasks")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientsScreen() = ListScreen(title = "Клиенты", path = "/clients")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ListScreen(title: String, path: String) {
    var rows by remember { mutableStateOf<JSONArray?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(path) {
        error = null
        try { rows = ApiClient.getList(path) }
        catch (e: Exception) { error = e.message }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(title) }) }) { p ->
        Column(Modifier.fillMaxSize().padding(p).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            error?.let { Text("Ошибка: $it", color = MaterialTheme.colorScheme.error) }
            rows?.let { arr ->
                if (arr.length() == 0) Text("Пока пусто")
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(arr.length()) { i ->
                        val row = arr.optJSONObject(i)
                        Text(
                            row?.optString("title", row?.optString("name", "—")) ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}
