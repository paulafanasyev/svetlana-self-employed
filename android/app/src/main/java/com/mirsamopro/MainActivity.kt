package com.mirsamopro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.mirsamopro.data.TokenStore
import com.mirsamopro.network.ApiClient
import com.mirsamopro.network.AuthApi
import com.mirsamopro.ui.AppNav
import com.mirsamopro.ui.theme.MirTheme
class MainActivity : ComponentActivity() {

    private lateinit var tokenStore: TokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenStore = TokenStore(applicationContext)
        // Hydrate the API client before drawing UI (restores a valid session).
        ApiClient.setToken(tokenStore.access())

        setContent {
            MirTheme {
                AppNav(
                    isLoggedIn = tokenStore.hasToken(),
                    onLogin = { email, password ->
                        val res = AuthApi.login(email, password)
                        ApiClient.setToken(res.optString("access_token"))
                        tokenStore.save(res.optString("access_token"), res.optString("refresh_token"))
                    },
                    onRegister = { name, email, password ->
                        val res = AuthApi.register(name, email, password)
                        ApiClient.setToken(res.optString("access_token"))
                        tokenStore.save(res.optString("access_token"), res.optString("refresh_token"))
                    },
                    onLogout = {
                        runCatching { AuthApi.logout() }
                        ApiClient.setToken(null)
                        tokenStore.clear()
                    },
                )
            }
        }
    }
}
