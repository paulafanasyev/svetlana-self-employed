# Keep Compose + OkHttp essentials; the app has no reflection-heavy libs.
-keep class com.mirsamopro.** { *; }
-keep class okhttp3.** { *; }
-keep class kotlin.Metadata { *; }

# OkHttp optionally supports alternative TLS adapters via reflection:
# Conscrypt, OpenJSSE and BouncyCastle JSSE. These classes are absent from
# the Android compile classpath, so R8 reports "missing class" errors.
# They are never loaded on Android (the platform provider is used instead),
# so the references are safe to ignore.
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn org.bouncycastle.jsse.**
