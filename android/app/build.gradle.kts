import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mirsamopro"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mirsamopro"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "3.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        // Backend base URL — overridable via gradle property for local testing.
        // Never store secrets here; the app holds no API keys (§7).
        buildConfigField("String", "API_BASE_URL", "\"${project.findProperty("mirApiBaseUrl") ?: "http://10.0.2.2:4000/api/v1"}\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Kotlin 1.9.22 ↔ Compose Compiler 1.5.10 (bundled in the offline cache).
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    // AndroidX core (versions present in the bundled offline cache)
    implementation("androidx.core:core-ktx:1.8.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.5.1")
    implementation("androidx.activity:activity-compose:1.5.1")

    // Jetpack Compose — Compose Compiler 1.5.10 (Kotlin 1.9.22) is bundled
    // offline; the UI artifacts resolve from Google's maven repo.
    val composeBom = platform("androidx.compose:compose-bom:2022.10.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui:1.3.0")
    implementation("androidx.compose.ui:ui-graphics:1.3.0")
    implementation("androidx.compose.ui:ui-tooling-preview:1.3.0")
    implementation("androidx.compose.foundation:foundation:1.3.0")
    implementation("androidx.compose.material3:material3:1.0.0")
    implementation("androidx.compose.runtime:runtime:1.3.0")

    // Networking — OkHttp only (no Retrofit codegen, keeps the build hermetic)
    implementation("com.squareup.okhttp3:okhttp:4.10.0")

    // Coroutines (version bundled offline)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.6.4")
    androidTestImplementation("androidx.test.ext:junit:1.1.3")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.3.0")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.3.0")
    debugImplementation("androidx.compose.ui:ui-tooling:1.3.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.3.0")
}

tasks.withType<KotlinCompile> {
    kotlinOptions {
        jvmTarget = "17"
    }
}
