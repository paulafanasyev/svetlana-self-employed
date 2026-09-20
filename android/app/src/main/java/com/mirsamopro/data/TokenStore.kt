package com.mirsamopro.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Хранилище токенов (§7, §39).
 *
 * Token'ы лежат в приватных SharedPreferences приложения (песочница процесса,
 * недоступна другим приложениям). Не в манифесте, не в BuildConfig, не в ресурсах —
 * в APK нет никаких секретов. При выходе/удалении аккаунта очищаются полностью.
 *
 * SharedPreferences выбран намеренно: он есть в базовом Android SDK и не требует
 * дополнительных артефактов, которых может не быть в офлайн-кэше сборки.
 */
class TokenStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(access: String, refresh: String) {
        prefs.edit().apply {
            putString(ACCESS, access)
            putString(REFRESH, refresh)
            apply()
        }
    }

    fun access(): String? = prefs.getString(ACCESS, null)
    fun refresh(): String? = prefs.getString(REFRESH, null)
    fun hasToken(): Boolean = !access().isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val PREFS = "mir_auth"
        private const val ACCESS = "access_token"
        private const val REFRESH = "refresh_token"
    }
}
