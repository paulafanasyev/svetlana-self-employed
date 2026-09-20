// Top-level build file — AGP 8.11.0 + Kotlin 1.9.22 + Java 17
// (matches the preinstalled offline toolchain: SDK 36, Build Tools 35.0.0)
//
// NOTE: the `org.jetbrains.kotlin.plugin.compose` Gradle plugin id only exists
// for Kotlin 2.0+. On Kotlin 1.9.x Compose is enabled via android.composeOptions
// in the module build file, so we must NOT declare the plugin here.
plugins {
    id("com.android.application") version "8.11.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
}
