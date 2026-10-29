package chat.stoat.screens.web

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalDensity
import chat.stoat.c2dm.CallEvents
import chat.stoat.c2dm.CallNotificationManager
import chat.stoat.services.LieCordPushService
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import chat.stoat.services.ScreenCaptureService
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import chat.stoat.R
import chat.stoat.activities.MainActivity
import chat.stoat.c2dm.ChannelRegistrator
import chat.stoat.c2dm.NotificationID
import logcat.LogPriority
import logcat.asLog
import logcat.logcat
import java.io.ByteArrayOutputStream

const val LIECORD_WEB_URL = "https://cord.lie2srvv.com"

/**
 * Handles capturing screen frames via Android MediaProjection and sending them to WebView
 */
object ScreenCaptureHelper {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    var isCapturing = false
        private set

    var onFrame: ((String) -> Unit)? = null

    fun onMediaProjectionReady(
        mp: MediaProjection,
        context: Context,
        targetWidth: Int = 720,
        targetFps: Int = 30
    ) {
        stop(null)
        mediaProjection = mp
        isCapturing = true

        try {
            mp.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    super.onStop()
                    Log.d("LieCordScreen", "MediaProjection callback onStop received")
                    stop(null)
                }
            }, Handler(Looper.getMainLooper()))
        } catch (e: Exception) {
            Log.e("LieCordScreen", "Failed to register MediaProjection callback: ${e.message}")
        }

        val metrics = context.resources.displayMetrics
        val width = if (targetWidth in 360..1920) targetWidth else 720
        val rawHeight = (width.toFloat() * metrics.heightPixels / metrics.widthPixels).toInt()
        val height = if (rawHeight % 2 != 0) rawHeight + 1 else rawHeight
        val density = metrics.densityDpi

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        imageReader = reader

        val vd = mp.createVirtualDisplay(
            "LieCordScreenCapture",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface, null, null
        )
        virtualDisplay = vd

        var lastFrameTime = 0L
        val minIntervalMs = if (targetFps in 10..60) (1000L / targetFps) else 33L

        reader.setOnImageAvailableListener({ ir ->
            val image = ir.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastFrameTime < minIntervalMs) {
                    image.close()
                    return@setOnImageAvailableListener
                }
                lastFrameTime = now

                val planes = image.planes
                val buffer = planes[0].buffer
                val pixelStride = planes[0].pixelStride
                val rowStride = planes[0].rowStride
                val rowPadding = rowStride - pixelStride * width

                val bmp = Bitmap.createBitmap(
                    width + rowPadding / pixelStride,
                    height,
                    Bitmap.Config.ARGB_8888
                )
                bmp.copyPixelsFromBuffer(buffer)

                val croppedBmp = if (rowPadding > 0) {
                    Bitmap.createBitmap(bmp, 0, 0, width, height).also {
                        if (it != bmp) bmp.recycle()
                    }
                } else {
                    bmp
                }

                val baos = ByteArrayOutputStream()
                croppedBmp.compress(Bitmap.CompressFormat.JPEG, 65, baos)
                croppedBmp.recycle()

                val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
                onFrame?.invoke(base64)
            } catch (e: Exception) {
                // Ignore transient frame encoding drop
            } finally {
                image.close()
            }
        }, null)
    }

    fun stop(context: Context? = null) {
        isCapturing = false
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
            mediaProjection?.stop()
            mediaProjection = null
            context?.let { ScreenCaptureService.stop(it) }
        } catch (_: Exception) {
        }
    }
}

class LieCordNativeBridge(
    private val context: Context,
    private val onStartShare: (width: Int, fps: Int) -> Unit,
    private val onStopShare: () -> Unit
) {
    @JavascriptInterface
    fun startScreenShare() {
        onStartShare(720, 30)
    }

    @JavascriptInterface
    fun startScreenShare(width: Int, fps: Int) {
        onStartShare(width, fps)
    }

    @JavascriptInterface
    fun stopScreenShare() {
        onStopShare()
    }

    @JavascriptInterface
    fun isNativeApp(): Boolean = true

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            }

            val safeDuration = durationMs.coerceIn(5L, 1000L)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(safeDuration, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(safeDuration)
            }
        } catch (e: Exception) {
            Log.e("LieCordBridge", "Vibrate error: ${e.message}")
        }
    }

    @JavascriptInterface
    fun showNotification(
        title: String,
        body: String,
        avatarUrl: String?,
        channelId: String?,
        messageId: String?
    ) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    Log.w("LieCordBridge", "POST_NOTIFICATIONS not granted")
                    return
                }
            }

            val safeChannelId = channelId?.takeIf { it.isNotBlank() } ?: "general"
            val safeMessageId = messageId?.takeIf { it.isNotBlank() } ?: System.currentTimeMillis().toString()

            val intent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("channelId", safeChannelId)
                putExtra("messageId", safeMessageId)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }

            val pendingIntent = android.app.PendingIntent.getActivity(
                context,
                safeChannelId.hashCode(),
                intent,
                android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
            )

            val builder = NotificationCompat.Builder(
                context,
                ChannelRegistrator.CHANNEL_ID_GROUP_CONVERSATIONS_MESSAGES
            )
                .setSmallIcon(R.drawable.ic_notification_monochrome)
                .setColor(0xFF3C639A.toInt())
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)

            NotificationManagerCompat.from(context).notify(
                safeChannelId,
                NotificationID.NEW_MESSAGE,
                builder.build()
            )
            Log.d("LieCordBridge", "Presented native notification: $title - $body")
        } catch (e: Exception) {
            Log.e("LieCordBridge", "Failed to show notification: ${e.message}", e)
        }
    }

    @JavascriptInterface
    fun showIncomingCall(
        channelId: String,
        callerId: String,
        callerName: String,
        avatarUrl: String?
    ) {
        CallNotificationManager.showIncomingCall(
            context,
            channelId,
            callerId,
            callerName,
            avatarUrl
        )
    }

    @JavascriptInterface
    fun dismissIncomingCall(channelId: String?) {
        CallNotificationManager.dismissIncomingCall(context, channelId)
    }

    @JavascriptInterface
    fun updateAuthSession(token: String, userId: String) {
        LieCordPushService.updateAuth(context, token, userId)
    }

    @JavascriptInterface
    fun getPushMode(): String {
        val prefs = context.getSharedPreferences(LieCordPushService.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(LieCordPushService.KEY_PUSH_MODE, "foreground") ?: "foreground"
    }

    @JavascriptInterface
    fun setPushMode(mode: String) {
        val prefs = context.getSharedPreferences(LieCordPushService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(LieCordPushService.KEY_PUSH_MODE, mode).apply()
        if (mode == "foreground") {
            LieCordPushService.start(context)
        } else {
            LieCordPushService.stop(context)
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LieCordWebScreen(
    initialUrl: String = LIECORD_WEB_URL,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    val pushPrefs = remember { context.getSharedPreferences(LieCordPushService.PREFS_NAME, Context.MODE_PRIVATE) }
    var showPushDialog by remember {
        mutableStateOf(!pushPrefs.getBoolean("push_mode_configured", false))
    }
    var selectedMode by remember {
        mutableStateOf(pushPrefs.getString(LieCordPushService.KEY_PUSH_MODE, "foreground") ?: "foreground")
    }

    LaunchedEffect(Unit) {
        ChannelRegistrator(context).register()
        val mode = pushPrefs.getString(LieCordPushService.KEY_PUSH_MODE, "foreground")
        if (mode == "foreground") {
            LieCordPushService.start(context)
        }
    }

    DisposableEffect(webViewInstance) {
        CallEvents.onCallDeclined = {
            webViewInstance?.post {
                webViewInstance?.evaluateJavascript(
                    "(function(){ try { if (window.voiceState) window.voiceState.stopIncomingCall(); } catch(e){} })()",
                    null
                )
            }
        }
        CallEvents.onCallAccepted = { channelId ->
            webViewInstance?.post {
                webViewInstance?.evaluateJavascript(
                    "(function(){ try { if (window.appHistory) window.appHistory.push('/channel/" + channelId + "'); if (window.voiceState) window.voiceState.acceptIncomingCall('" + channelId + "'); } catch(e){} })()",
                    null
                )
            }
        }
        onDispose {
            CallEvents.onCallDeclined = null
            CallEvents.onCallAccepted = null
        }
    }

    LaunchedEffect(webViewInstance) {
        val webView = webViewInstance ?: return@LaunchedEffect
        chat.stoat.c2dm.NotificationDeepLink.pendingNavigation.collect { nav ->
            if (nav != null) {
                val script = when (nav) {
                    is chat.stoat.internals.StoatWebLink.Server -> {
                        "(function(){ try { if (window.appHistory) window.appHistory.push('/server/${nav.serverId}'); } catch(e){} })()"
                    }
                    is chat.stoat.internals.StoatWebLink.Channel -> {
                        "(function(){ try { if (window.appHistory) window.appHistory.push('/channel/${nav.channelId}'); } catch(e){} })()"
                    }
                    is chat.stoat.internals.StoatWebLink.Message -> {
                        "(function(){ try { if (window.appHistory) window.appHistory.push('/channel/${nav.channelId}/${nav.messageId}'); } catch(e){} })()"
                    }
                }
                webView.post {
                    webView.evaluateJavascript(script, null)
                }
                chat.stoat.c2dm.NotificationDeepLink.pendingNavigation.value = null
            }
        }
    }
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }
    // Request POST_NOTIFICATIONS permission on Android 13+
    val notifPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Log.d("LieCordScreen", "Notification permission granted: $isGranted")
    }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // Custom fullscreen view holder (HTML5 video / custom view)
    var customFullscreenView by remember { mutableStateOf<android.view.View?>(null) }
    var customFullscreenCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }

    // File chooser callback holder
    var filePathCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = filePathCallback
        filePathCallback = null
        if (cb == null) return@rememberLauncherForActivityResult

        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val data = result.data
            val clipData = data?.clipData
            val uris = when {
                clipData != null -> {
                    (0 until clipData.itemCount).map { clipData.getItemAt(it).uri }.toTypedArray()
                }

                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
            cb.onReceiveValue(uris)
        } else {
            cb.onReceiveValue(null)
        }
    }

    // Permission request launcher for WebRTC (Mic & Camera)
    var pendingWebPermissionRequest by remember { mutableStateOf<PermissionRequest?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val req = pendingWebPermissionRequest
        pendingWebPermissionRequest = null
        if (req != null) {
            val resourcesToGrant = mutableListOf<String>()
            if (permissions[Manifest.permission.RECORD_AUDIO] == true) {
                resourcesToGrant.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
            }
            if (permissions[Manifest.permission.CAMERA] == true) {
                resourcesToGrant.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
            }

            if (resourcesToGrant.isNotEmpty()) {
                req.grant(resourcesToGrant.toTypedArray())
            } else {
                req.deny()
            }
        }
    }

    // Native MediaProjection Screen Share Launcher
    val mediaProjectionManager = remember {
        context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
    }

    var pendingCaptureWidth by remember { mutableStateOf(720) }
    var pendingCaptureFps by remember { mutableStateOf(30) }

    val screenCaptureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            ScreenCaptureService.startCapture(
                context = context,
                resultCode = result.resultCode,
                resultData = data,
                targetWidth = pendingCaptureWidth,
                targetFps = pendingCaptureFps
            )
        }
    }

    LaunchedEffect(webViewInstance) {
        ScreenCaptureHelper.onFrame = { base64 ->
            webViewInstance?.post {
                webViewInstance?.evaluateJavascript(
                    "if(window.__liecordFeedFrame)window.__liecordFeedFrame('" + base64 + "');",
                    null
                )
            }
        }
    }

    val activity = remember(context) { context.findActivity() }

    // Back button navigation: handle custom fullscreen view, handleAndroidBack, goBack, or moveTaskToBack
    BackHandler(enabled = true) {
        if (customFullscreenView != null) {
            customFullscreenCallback?.onCustomViewHidden()
            customFullscreenView = null
            customFullscreenCallback = null
            return@BackHandler
        }
        val wv = webViewInstance
        if (wv != null) {
            wv.evaluateJavascript(
                "(function() { try { return (typeof window.handleAndroidBack === 'function') ? (window.handleAndroidBack() === true) : false; } catch(e) { return false; } })()"
            ) { result ->
                val handled = result == "true"
                if (!handled) {
                    if (wv.canGoBack()) {
                        wv.goBack()
                    } else {
                        activity?.moveTaskToBack(true)
                    }
                }
            }
        } else {
            activity?.moveTaskToBack(true)
        }
    }

    var nativeBottomInsetDp by remember { mutableStateOf(24f) }

    if (showPushDialog) {
        AlertDialog(
            onDismissRequest = { /* Force explicit user choice */ },
            title = {
                Text(
                    text = "Тип уведомлений",
                    style = MaterialTheme.typography.titleLarge.copy(
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Выберите способ доставки сообщений и звонков:",
                        color = Color(0xFFC7C5C5),
                        style = MaterialTheme.typography.bodyMedium
                    )

                    // Option 1: Foreground Service (Default)
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedMode = "foreground" },
                        shape = RoundedCornerShape(14.dp),
                        color = if (selectedMode == "foreground") Color(0xFF233145) else Color(0xFF222020),
                        border = BorderStroke(
                            1.dp,
                            if (selectedMode == "foreground") Color(0xFF5A8AD4) else Color(0xFF383535)
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = selectedMode == "foreground",
                                    onClick = { selectedMode = "foreground" }
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Foreground Service",
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.SemiBold
                                    )
                                )
                            }
                            AnimatedVisibility(visible = selectedMode == "foreground") {
                                Text(
                                    text = "Прямое защищённое соединение с сервером LieCord без использования сервисов Google. Доставка сообщений и звонков происходит моментально (0 мс) даже при слабом интернете. Для защиты процесса от усыпления системой в шторке отображается тихий значок.",
                                    color = Color(0xFFD6E3F8),
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(start = 12.dp, top = 6.dp, end = 6.dp)
                                )
                            }
                        }
                    }

                    // Option 2: Google FCM
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedMode = "fcm" },
                        shape = RoundedCornerShape(14.dp),
                        color = if (selectedMode == "fcm") Color(0xFF233145) else Color(0xFF222020),
                        border = BorderStroke(
                            1.dp,
                            if (selectedMode == "fcm") Color(0xFF5A8AD4) else Color(0xFF383535)
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = selectedMode == "fcm",
                                    onClick = { selectedMode = "fcm" }
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Google FCM",
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.SemiBold
                                    )
                                )
                            }
                            AnimatedVisibility(visible = selectedMode == "fcm") {
                                Text(
                                    text = "Использует системную службу Google Play Services. Процесс приложения полностью спит в фоне до прихода push-уведомления. Требует наличия сервисов Google на устройстве.",
                                    color = Color(0xFFD6E3F8),
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(start = 12.dp, top = 6.dp, end = 6.dp)
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        pushPrefs.edit()
                            .putString(LieCordPushService.KEY_PUSH_MODE, selectedMode)
                            .putBoolean("push_mode_configured", true)
                            .apply()
                        showPushDialog = false

                        if (selectedMode == "foreground") {
                            LieCordPushService.start(context)
                        } else {
                            LieCordPushService.stop(context)
                        }

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF3C639A)
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(text = "Выбрать", color = Color.White)
                }
            },
            containerColor = Color(0xFF1B1919),
            shape = RoundedCornerShape(20.dp)
        )
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF151313))
            .statusBarsPadding()
            .imePadding()
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    WebView.setWebContentsDebuggingEnabled(true)
                    ViewCompat.setOnApplyWindowInsetsListener(this) { v, windowInsets ->
                        val navBars = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars())
                        val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
                        val density = ctx.resources.displayMetrics.density
                        val navBottomDp = navBars.bottom / density
                        val imeBottomDp = ime.bottom / density
                        val effectiveDp = if (imeBottomDp > 0) 0f else navBottomDp
                        nativeBottomInsetDp = effectiveDp
                        Log.d("LieCordScreen", "WindowInsets: nav=${navBars.bottom} (${navBottomDp}dp), ime=${ime.bottom}, effective=${effectiveDp}dp")
                        v.post {
                            (v as? WebView)?.evaluateJavascript(
                                "document.documentElement.style.setProperty('--android-bottom-inset', '${effectiveDp}px');",
                                null
                            )
                        }
                        windowInsets
                    }
                    ViewCompat.requestApplyInsets(this)
                    webViewInstance = this
                    setBackgroundColor(android.graphics.Color.parseColor("#151313"))

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = true
                        allowContentAccess = true
                        loadWithOverviewMode = true
                        useWideViewPort = true
                        builtInZoomControls = true
                        displayZoomControls = false
                        setSupportZoom(true)
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        cacheMode = WebSettings.LOAD_DEFAULT

                        val currentUa = userAgentString
                        userAgentString = "$currentUa LieCordMobile/1.0"
                    }

                    val cookieManager = CookieManager.getInstance()
                    cookieManager.setAcceptCookie(true)
                    cookieManager.setAcceptThirdPartyCookies(this, true)

                    // Prevent Chromium's native long-press link callout/preview bubble while keeping input selection intact
                    isLongClickable = true
                    setOnLongClickListener { view ->
                        val hitTest = (view as? WebView)?.hitTestResult
                        if (hitTest != null) {
                            when (hitTest.type) {
                                WebView.HitTestResult.EDIT_TEXT_TYPE -> false
                                else -> true // Consume long click on links, images, anchors to prevent native bubble
                            }
                        } else {
                            false
                        }
                    }
                    setOnDragListener { _, _ -> true }

                    addJavascriptInterface(
                        LieCordNativeBridge(
                            context = ctx,
                            onStartShare = { width, fps ->
                                post {
                                    pendingCaptureWidth = width
                                    pendingCaptureFps = fps
                                    mediaProjectionManager?.let { manager ->
                                        screenCaptureLauncher.launch(manager.createScreenCaptureIntent())
                                    }
                                }
                            },
                            onStopShare = {
                                post {
                                    ScreenCaptureService.stop(context)
                                }
                            }
                        ),
                        "LieCordNative"
                    )

                    setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
                        try {
                            val request = DownloadManager.Request(Uri.parse(url)).apply {
                                setMimeType(mimetype)
                                addRequestHeader("User-Agent", userAgent)
                                setDescription("Downloading file from LieCord...")
                                setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype))
                                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                setDestinationInExternalPublicDir(
                                    Environment.DIRECTORY_DOWNLOADS,
                                    URLUtil.guessFileName(url, contentDisposition, mimetype)
                                )
                            }
                            val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                            dm.enqueue(request)
                            Toast.makeText(ctx, "Загрузка началась...", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {
                            Toast.makeText(ctx, "Ошибка загрузки: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            isLoading = true
                            hasError = false
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            isLoading = false
                            // Inject Material You dark mobile viewport enhancements, touch callout suppression and frame receiver
                            view?.evaluateJavascript(
                                """
                                (function() {
                                    window.isLieCordApp = true;
                                    document.documentElement.style.setProperty('--primary-background', '#151313');
                                    document.documentElement.style.setProperty('--android-bottom-inset', '${nativeBottomInsetDp}px');
                                    document.body.style.backgroundColor = '#151313';
                                    if (!document.getElementById('liecord-mobile-callout-fix')) {
                                        const style = document.createElement('style');
                                        style.id = 'liecord-mobile-callout-fix';
                                        style.innerHTML = `
                                            * {
                                                -webkit-touch-callout: none !important;
                                                -webkit-user-drag: none !important;
                                                user-drag: none !important;
                                            }
                                            a, img, button {
                                                -webkit-touch-callout: none !important;
                                                -webkit-user-drag: none !important;
                                                user-drag: none !important;
                                            }
                                            input, textarea, [contenteditable="true"] {
                                                -webkit-user-select: text !important;
                                                user-select: text !important;
                                            }
                                            div[class*="MessageBox__Base"] {
                                                padding-bottom: calc(max(env(safe-area-inset-bottom, 0px), var(--android-bottom-inset, 0px)) + 6px) !important;
                                            }
                                            div[class*="BottomNavigation__Base"] {
                                                padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--android-bottom-inset, 0px)) !important;
                                            }
                                        `;
                                        document.head.appendChild(style);
                                    }
                                    if (!window.__liecordFeedFrame) {
                                        window.__liecordFeedFrame = function(base64) {
                                            const canvas = window.__liecordScreenCanvas;
                                            if (!canvas) return;
                                            const img = new Image();
                                            img.onload = function() {
                                                const ctx = canvas.getContext('2d');
                                                if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                            };
                                            img.src = 'data:image/jpeg;base64,' + base64;
                                        };
                                    }
                                })();
                                """.trimIndent(),
                                null
                            )
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?
                        ) {
                            super.onReceivedError(view, request, error)
                            if (request?.isForMainFrame == true) {
                                isLoading = false
                                hasError = true
                                errorMessage = error?.description?.toString() ?: "Сетевая ошибка"
                            }
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean {
                            val url = request?.url?.toString() ?: return false
                            if (url.startsWith(LIECORD_WEB_URL) || url.startsWith("https://cord.lie2srvv.com")) {
                                return false
                            }
                            // Open external links in external browser
                            return try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                ctx.startActivity(intent)
                                true
                            } catch (e: Exception) {
                                false
                            }
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowCustomView(
                            view: android.view.View?,
                            callback: CustomViewCallback?
                        ) {
                            if (customFullscreenView != null) {
                                callback?.onCustomViewHidden()
                                return
                            }
                            customFullscreenView = view
                            customFullscreenCallback = callback
                        }

                        override fun onHideCustomView() {
                            customFullscreenCallback?.onCustomViewHidden()
                            customFullscreenView = null
                            customFullscreenCallback = null
                        }

                        override fun onPermissionRequest(request: PermissionRequest) {
                            val audioRequested = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                            val videoRequested = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

                            val hasAudio = ActivityCompat.checkSelfPermission(
                                ctx,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED
                            val hasVideo = ActivityCompat.checkSelfPermission(
                                ctx,
                                Manifest.permission.CAMERA
                            ) == PackageManager.PERMISSION_GRANTED

                            val permissionsToAsk = mutableListOf<String>()
                            if (audioRequested && !hasAudio) permissionsToAsk.add(Manifest.permission.RECORD_AUDIO)
                            if (videoRequested && !hasVideo) permissionsToAsk.add(Manifest.permission.CAMERA)

                            if (permissionsToAsk.isEmpty()) {
                                request.grant(request.resources)
                            } else {
                                pendingWebPermissionRequest = request
                                permissionLauncher.launch(permissionsToAsk.toTypedArray())
                            }
                        }

                        override fun onShowFileChooser(
                            webView: WebView?,
                            filePathCallbackParam: ValueCallback<Array<Uri>>?,
                            fileChooserParams: FileChooserParams?
                        ): Boolean {
                            filePathCallback?.onReceiveValue(null)
                            filePathCallback = filePathCallbackParam

                            val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                                type = "*/*"
                                addCategory(Intent.CATEGORY_OPENABLE)
                            }

                            return try {
                                filePickerLauncher.launch(intent)
                                true
                            } catch (e: Exception) {
                                filePathCallback = null
                                false
                            }
                        }
                    }

                    loadUrl(initialUrl)
                }
            },
            update = { view ->
                webViewInstance = view
            }
        )

        if (customFullscreenView != null) {
            AndroidView(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
                factory = { _ -> customFullscreenView!! }
            )
        }

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF151313)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        if (hasError) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF151313))
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center
            ) {
                Text(
                    text = "Не удалось загрузить LieCord",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFAAAAAA)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        hasError = false
                        isLoading = true
                        webViewInstance?.reload()
                    }
                ) {
                    Text("Повторить")
                }
            }
        }
    }
}

private fun Context.findActivity(): Activity? {
    var currentContext = this
    while (currentContext is ContextWrapper) {
        if (currentContext is Activity) {
            return currentContext
        }
        currentContext = currentContext.baseContext
    }
    return null
}
