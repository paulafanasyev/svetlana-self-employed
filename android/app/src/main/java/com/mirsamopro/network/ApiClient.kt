package com.mirsamopro.network

import com.mirsamopro.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Единственный сетевой слой Android-клиента (§6, §42).
 *
 * Тот же backend, тот же контракт, что и web-клиент. Никаких фейковых
 * ответов: при ошибке кидаем [ApiException] и UI показывает его честно.
 */
object ApiClient {

    private const val JSON = "application/json; charset=utf-8"
    val BASE: String = BuildConfig.API_BASE_URL.trimEnd('/')

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS) // AI-ходы могут быть долгими
        .build()

    // --- token store, set from DataStore on app start ---------------------
    @Volatile private var accessToken: String? = null
    @Volatile private var refreshToken: String? = null
    @Volatile private var persistTokens: ((String, String) -> Unit)? = null

    fun setToken(token: String?) { accessToken = token }
    fun setTokens(access: String?, refresh: String?) {
        accessToken = access
        refreshToken = refresh
    }
    fun setTokenPersistence(callback: ((String, String) -> Unit)?) { persistTokens = callback }
    fun hasToken(): Boolean = !accessToken.isNullOrBlank()

    // --- generic ----------------------------------------------------------
    private fun request(path: String): Request.Builder {
        val b = Request.Builder().url("$BASE${if (path.startsWith("/")) path else "/$path"}")
        accessToken?.let { b.addHeader("Authorization", "Bearer $it") }
        return b
    }

    private fun execute(req: Request, allowRefresh: Boolean = true): JSONObject {
        client.newCall(req).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val body = if (text.isNotBlank()) runCatching { JSONObject(text) }.getOrNull() else null
            if (response.code == 401 && allowRefresh && !refreshToken.isNullOrBlank()) {
                val refreshed = runCatching { refreshAccessToken() }.getOrDefault(false)
                if (refreshed) return execute(reqWithBearer(req, accessToken), allowRefresh = false)
            }
            if (!response.isSuccessful) {
                val code = body?.optString("error")?.ifBlank { "http_error" } ?: "http_error"
                val msg = body?.optString("message")?.ifBlank { "HTTP " + response.code } ?: ("HTTP " + response.code)
                throw ApiException(code, msg, response.code)
            }
            return body ?: JSONObject()
        }
    }

    private fun reqWithBearer(req: Request, token: String?): Request {
        return if (token.isNullOrBlank()) req
        else req.newBuilder().header("Authorization", "Bearer $token").build()
    }

    private fun refreshAccessToken(): Boolean {
        val raw = refreshToken ?: return false
        val body = JSONObject().put("refresh_token", raw).toString().toRequestBody(JSON.toMediaType())
        val request = Request.Builder().url("$BASE/auth/refresh").post(body).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                accessToken = null
                refreshToken = null
                persistTokens?.invoke("", "")
                return false
            }
            val json = JSONObject(response.body?.string().orEmpty())
            val access = json.optString("access_token")
            val refresh = json.optString("refresh_token")
            if (access.isBlank() || refresh.isBlank()) {
                accessToken = null
                refreshToken = null
                persistTokens?.invoke("", "")
                return false
            }
            setTokens(access, refresh)
            persistTokens?.invoke(access, refresh)
            return true
        }
    }

    fun get(path: String): JSONObject = execute(request(path).build())
    fun post(path: String, body: JSONObject = JSONObject()): JSONObject =
        execute(request(path).post(body.toString().toRequestBody(JSON.toMediaType())).build())
    fun put(path: String, body: JSONObject = JSONObject()): JSONObject =
        execute(request(path).put(body.toString().toRequestBody(JSON.toMediaType())).build())
    fun delete(path: String): JSONObject = execute(request(path).delete().build())

    fun getList(path: String): JSONArray = get(path).optJSONArray("data") ?: JSONArray()
}

class ApiException(val code: String, message: String, val httpStatus: Int = 0) : Exception(message)
