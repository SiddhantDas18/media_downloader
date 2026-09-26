package expo.modules.floatingbubble

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlin.math.abs

/**
 * Keeps a small draggable bubble over other apps. Android 10+ blocks background clipboard reads, so the bubble
 * reads the clipboard only when tapped: it briefly becomes focusable, reads once it has window focus, then opens
 * `<scheme>://preview?url=…` in the app. Starting an activity from here is allowed because the user granted
 * "Display over other apps".
 */
class BubbleService : Service() {
  companion object {
    @Volatile var running = false
    private const val CHANNEL = "floating_bubble"
    private const val NOTIFICATION_ID = 4101
    private val URL = Regex("https?://\\S+")
  }

  private lateinit var wm: WindowManager
  private lateinit var params: WindowManager.LayoutParams
  private var bubble: BubbleView? = null
  private var scheme = "redditdownloader"
  private val main = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intent?.getStringExtra("scheme")?.let { scheme = it }
    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, notification(),
      if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    )
    if (bubble == null) addBubble()
    running = true
    return START_STICKY
  }

  override fun onDestroy() {
    bubble?.let { wm.removeView(it) }
    bubble = null
    running = false
    super.onDestroy()
  }

  private fun notification() = run {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Download bubble", NotificationManager.IMPORTANCE_MIN))
    }
    val open = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Download bubble is on")
      .setContentText("Copy a post link, then tap the bubble")
      .setOngoing(true)
      .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
      .build()
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun addBubble() {
    wm = getSystemService(WINDOW_SERVICE) as WindowManager
    val size = (56 * resources.displayMetrics.density).toInt()
    params = WindowManager.LayoutParams(
      size, size,
      if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = resources.displayMetrics.widthPixels - size - 24
      y = (resources.displayMetrics.heightPixels * 0.35).toInt()
    }

    val view = BubbleView(this).apply {
      text = "↓"
      textSize = 26f
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor("#0f1011"))
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#bbe75f")) }
      elevation = 12f
      contentDescription = "Download copied link"
    }

    // Drag to move; a tap (movement under touch slop) reads the clipboard.
    val slop = ViewConfiguration.get(this).scaledTouchSlop
    var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
    view.setOnTouchListener { _, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; moved = false; true }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX; val dy = e.rawY - downY
          if (abs(dx) > slop || abs(dy) > slop) moved = true
          if (moved) { params.x = startX + dx.toInt(); params.y = startY + dy.toInt(); wm.updateViewLayout(view, params) }
          true
        }
        MotionEvent.ACTION_UP -> { if (!moved) requestClipboard(view); true }
        else -> false
      }
    }
    wm.addView(view, params)
    bubble = view
  }

  private fun requestClipboard(view: BubbleView) {
    view.pendingRead = true
    params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
    wm.updateViewLayout(view, params)
    // If focus never arrives, give up and go back to not stealing input.
    main.postDelayed({ if (view.pendingRead) { view.pendingRead = false; unfocus(view); toast("Couldn't read the clipboard. Try again.") } }, 800)
  }

  private fun unfocus(view: BubbleView) {
    params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
    if (view.isAttachedToWindow) wm.updateViewLayout(view, params)
  }

  internal fun onFocused(view: BubbleView) {
    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
    unfocus(view)
    val url = URL.find(text)?.value
    if (url == null) return toast("Copy a post link first")
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://preview?url=${Uri.encode(url)}"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    startActivity(open)
  }

  private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

  inner class BubbleView(context: Context) : TextView(context) {
    var pendingRead = false
    override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
      super.onWindowFocusChanged(hasWindowFocus)
      if (hasWindowFocus && pendingRead) { pendingRead = false; onFocused(this) }
    }
  }
}
