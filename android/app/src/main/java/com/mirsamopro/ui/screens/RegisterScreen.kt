package com.mirsamopro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
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
fun RegisterScreen(
    onRegister: suspend (String, String, String) -> Unit,
    onSuccess: () -> Unit,
    onLogin: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(topBar = { TopAppBar(title = { Text("Регистрация — Мир Самозанятых") }) }) { p ->
        Column(
            Modifier.fillMaxSize().padding(p).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("После регистрации вы попадёте в рабочее пространство")
            OutlinedTextField(value = name, onValueChange = { name = it },
                label = { Text("Как вас зовут") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = email, onValueChange = { email = it },
                label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = password, onValueChange = { password = it },
                label = { Text("Пароль (мин. 8)") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

            Button(
                onClick = {
                    if (name.length < 2 || email.isBlank() || password.length < 8) {
                        error = "Имя (2+), email и пароль (8+) обязательны"; return@Button
                    }
                    busy = true; error = null
                    scope.launch {
                        try {
                            onRegister(name.trim(), email.trim(), password)
                            onSuccess()
                        } catch (e: ApiException) { error = e.message }
                        catch (e: Exception) { error = "Сеть недоступна: ${e.message}" }
                        finally { busy = false }
                    }
                },
                enabled = !busy, modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Создаём…" else "Создать аккаунт") }

            Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) { Text("Уже есть аккаунт? Войти") }
        }
    }
}
