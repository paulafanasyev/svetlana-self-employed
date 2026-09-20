package com.mirsamopro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Главный экран: точки входа в рабочее пространство (§36).
 * Светлана, задачи, клиенты — всё через общий backend.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onChat: () -> Unit,
    onTasks: () -> Unit,
    onClients: () -> Unit,
    onLogout: () -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Мир Самозанятых") }) }) { p ->
        Column(
            Modifier.fillMaxSize().padding(p).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Светлана — ваш AI-оператор", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Один продукт с web: одни данные, один backend. " +
                    "Клиент или задача, созданные тут, видны на сайте.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = onChat, modifier = Modifier.fillMaxWidth()) {
                Text("✨ Поговорить со Светланой")
            }
            Button(onClick = onTasks, modifier = Modifier.fillMaxWidth()) {
                Text("✅ Задачи")
            }
            Button(onClick = onClients, modifier = Modifier.fillMaxWidth()) {
                Text("👥 Клиенты")
            }
            Button(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(),
            ) { Text("Выйти") }
        }
    }
}
