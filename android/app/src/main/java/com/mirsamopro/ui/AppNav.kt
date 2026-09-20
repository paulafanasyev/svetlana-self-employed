package com.mirsamopro.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.mirsamopro.ui.screens.ChatScreen
import com.mirsamopro.ui.screens.ClientsScreen
import com.mirsamopro.ui.screens.HomeScreen
import com.mirsamopro.ui.screens.LoginScreen
import com.mirsamopro.ui.screens.RegisterScreen
import com.mirsamopro.ui.screens.TasksScreen

/**
 * Навигация Android-клиента (§36).
 *
 * Минимальный state-роутер: не тянет dependency навигации, которых может не
 * оказаться в офлайн-кэше сборки. Login/Register — для неаутентифицированных;
 * рабочие разделы — за auth-стеной. Тот же backend, что и web: клиент и задача,
 * созданные тут, видны на сайте (E2E §44.8/§44.9).
 */
sealed class Routes(val route: String) {
    data object Login : Routes("login")
    data object Register : Routes("register")
    data object Home : Routes("home")
    data object Chat : Routes("chat")
    data object Tasks : Routes("tasks")
    data object Clients : Routes("clients")
}

@Composable
fun AppNav(
    isLoggedIn: Boolean,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
    onLogout: () -> Unit,
) {
    var current by remember { mutableStateOf(if (isLoggedIn) Routes.Home.route else Routes.Login.route) }

    when (current) {
        Routes.Login.route -> LoginScreen(
            onSuccess = { current = Routes.Home.route },
            onRegister = { current = Routes.Register.route },
        )
        Routes.Register.route -> RegisterScreen(
            onSuccess = { current = Routes.Home.route },
            onLogin = { current = Routes.Login.route },
        )
        Routes.Home.route -> HomeScreen(
            onChat = { current = Routes.Chat.route },
            onTasks = { current = Routes.Tasks.route },
            onClients = { current = Routes.Clients.route },
            onLogout = { onLogout(); current = Routes.Login.route },
        )
        Routes.Chat.route -> ChatScreen(onLogout = { onLogout(); current = Routes.Login.route })
        Routes.Tasks.route -> TasksScreen()
        Routes.Clients.route -> ClientsScreen()
    }
}
