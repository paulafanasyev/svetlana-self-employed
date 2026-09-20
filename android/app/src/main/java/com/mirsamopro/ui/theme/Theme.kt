package com.mirsamopro.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Бренд: глубокий фиолетовый (как и в web-клиенте — единый продукт, §11)
private val Violet900 = Color(0xFF3B0964)
private val Violet700 = Color(0xFF6D28D9)
private val Violet500 = Color(0xFF8B5CF6)
private val Violet50 = Color(0xFFF5F3FF)

private val LightColors = lightColorScheme(
    primary = Violet700,
    onPrimary = Color.White,
    primaryContainer = Violet50,
    secondary = Violet500,
    background = Color(0xFFF8FAFC),
    surface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Violet500,
    onPrimary = Color.White,
    primaryContainer = Violet900,
    background = Color(0xFF14121F),
    surface = Color(0xFF1E1A2E),
)

@Composable
fun MirTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
