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
    fun setToken(token: String?) { accessToken = token }
    fun hasToken(): Boolean = !accessToken.isNullOrBlank()

    // --- generic ----------------------------------------------------------
    private fun request(path: String): Request.Builder {
        val b = Request.Builder().url("$BASE${if (path.startsWith("/")) path else "/$path"}")
        accessToken?.let { b.addHeader("Authorization", "Bearer $it") }
        return b
    }

    private fun execute(req: Request): JSONObject {
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val body = if (text.isNotBlank()) runCatching { JSONObject(text) }.getOrNull() else null
            if (!res.isSuccessful) {
                val code = body?.optString("error")?.ifBlank { "http_error" } ?: "http_error"
                val msg = body?.optString("message")?.ifBlank { "HTTP ${res.code}" } ?: "HTTP ${res.code}"
                throw ApiException(code, msg, res.code)
            }
            return body ?: JSONObject()
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
