package expo.modules.floatingbubble

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FloatingBubbleModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FloatingBubble")

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    // "Display over other apps" can only be granted from this system screen.
    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("start") { scheme: String ->
      if (!Settings.canDrawOverlays(context)) return@Function false
      ContextCompat.startForegroundService(context, Intent(context, BubbleService::class.java).putExtra("scheme", scheme))
      true
    }

    Function("stop") {
      context.stopService(Intent(context, BubbleService::class.java))
    }

    Function("isRunning") { BubbleService.running }
  }
}
