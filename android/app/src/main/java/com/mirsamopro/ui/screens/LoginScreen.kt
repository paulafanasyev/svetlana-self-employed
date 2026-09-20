package com.mirsamopro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.mirsamopro.network.ApiException
import com.mirsamopro.network.AuthApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onSuccess: () -> Unit, onRegister: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(topBar = { TopAppBar(title = { Text("Вход — Мир Самозанятых") }) }) { p ->
        Column(
            Modifier.fillMaxSize().padding(p).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            OutlinedTextField(
                value = email, onValueChange = { email = it },
                label = { Text("Email") }, singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                label = { Text("Пароль") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxSize(),
            )
            error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) { error = "Заполните email и пароль"; return@Button }
                    busy = true; error = null
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) { AuthApi.login(email.trim(), password) }
                            onSuccess()
                        } catch (e: ApiException) { error = e.message }
                        catch (e: Exception) { error = "Сеть недоступна: ${e.message}" }
                        finally { busy = false }
                    }
                },
                enabled = !busy, modifier = Modifier.fillMaxSize(),
            ) { Text(if (busy) "Входим…" else "Войти") }

            OutlinedButton(onClick = onRegister, modifier = Modifier.fillMaxSize()) {
                Text("Нет аккаунта? Зарегистрироваться")
            }
        }
    }
}
