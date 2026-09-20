package com.mirsamopro.network

import org.json.JSONArray
import org.json.JSONObject

/**
 * Auth API (§39): register/login/refresh/me/logout.
 * Токены хранятся в DataStore (см. [com.mirsamopro.data.TokenStore]) — никогда
 * не в BuildConfig и не в ресурсах (§7: никаких keys в APK).
 */
object AuthApi {

    fun register(displayName: String, email: String, password: String, role: String = "user"): JSONObject {
        val body = JSONObject().apply {
            put("display_name", displayName)
            put("email", email)
            put("password", password)
            put("role", role)
            put("consent_ai_processing", true) // требуется сервером
        }
        return ApiClient.post("/auth/register", body)
    }

    fun login(email: String, password: String): JSONObject {
        val body = JSONObject().apply {
            put("email", email)
            put("password", password)
        }
        return ApiClient.post("/auth/login", body)
    }

    fun refresh(refreshToken: String): JSONObject {
        val body = JSONObject().put("refresh_token", refreshToken)
        return ApiClient.post("/auth/refresh", body)
    }

    fun me(): JSONObject = ApiClient.get("/auth/me")

    fun logout(): JSONObject = ApiClient.post("/auth/logout")

    fun approveAction(actionId: String): JSONObject =
        ApiClient.post("/ai/actions/$actionId/approve")

    /** Все сущности пользователя — для drawer'а и E2E-проверок. */
    fun exportData(): JSONObject = ApiClient.get("/auth/export")

    /** Список клиентов CRM (используется в E2E: ANDROID создаёт → WEB видит). */
    fun clients(): JSONArray = ApiClient.getList("/clients")

    fun createClient(name: String, email: String? = null, phone: String? = null): JSONObject {
        val body = JSONObject().put("name", name)
        email?.let { body.put("email", it) }
        phone?.let { body.put("phone", it) }
        return ApiClient.post("/clients", body)
    }
}
