package chat.stoat.services

import android.Manifest
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import chat.stoat.R
import chat.stoat.activities.MainActivity
import chat.stoat.c2dm.CallNotificationManager
import chat.stoat.c2dm.ChannelRegistrator
import chat.stoat.c2dm.NotificationID
import com.bumptech.glide.Glide
import com.bumptech.glide.request.target.CustomTarget
import com.bumptech.glide.request.transition.Transition
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class LieCordPushService : Service() {
    companion object {
        private const val TAG = "LieCordPushService"
        const val PREFS_NAME = "liecord_prefs"
        const val KEY_PUSH_MODE = "push_mode" // "foreground" or "fcm"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_SELF_ID = "self_id"

        const val ACTION_START = "chat.stoat.action.START_PUSH_SERVICE"
        const val ACTION_STOP = "chat.stoat.action.STOP_PUSH_SERVICE"
        const val ACTION_UPDATE_AUTH = "chat.stoat.action.UPDATE_AUTH"
        const val EXTRA_TOKEN = "extra_token"
        const val EXTRA_USER_ID = "extra_user_id"
        const val WS_URL = "wss://cord.lie2srvv.com/ws?format=json"
        const val API_URL = "https://cord.lie2srvv.com/api"
        const val AUTUMN_URL = "https://cord.lie2srvv.com/autumn"

        fun start(context: Context) {
            try {
                val intent = Intent(context, LieCordPushService::class.java).apply {
                    action = ACTION_START
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service: ${e.message}")
            }
        }

        fun updateAuth(context: Context, token: String, userId: String) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit()
                    .putString(KEY_AUTH_TOKEN, token)
                    .putString(KEY_SELF_ID, userId)
                    .apply()

                val intent = Intent(context, LieCordPushService::class.java).apply {
                    action = ACTION_UPDATE_AUTH
                    putExtra(EXTRA_TOKEN, token)
                    putExtra(EXTRA_USER_ID, userId)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update auth: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                val intent = Intent(context, LieCordPushService::class.java).apply {
                    action = ACTION_STOP
                }
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop service: ${e.message}")
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var okHttpClient: OkHttpClient? = null
    private var webSocket: WebSocket? = null
    private var isConnected = false
    private var isDestroyed = false

    private var currentToken: String? = null
    private var currentSelfId: String? = null

    // Cache user display names and avatar URLs: userId -> Pair(name, avatarUrl?)
    private val userProfileCache = ConcurrentHashMap<String, Pair<String, String?>>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        ChannelRegistrator(this).register()
        startPersistentForeground()
        loadStoredAuth()
    }

    private fun startPersistentForeground() {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            201,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(
            this,
            ChannelRegistrator.CHANNEL_ID_SERVICE_STATUS
        )
            .setSmallIcon(R.drawable.ic_notification_monochrome)
            .setColor(0xFF3C639A.toInt())
            .setContentTitle("LieCord")
            .setContentText("Фоновое соединение активно")
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setShowWhen(false)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NotificationID.FOREGROUND_SERVICE,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NotificationID.FOREGROUND_SERVICE,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NotificationID.FOREGROUND_SERVICE, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground error: ${e.message}")
        }
    }

    private fun loadStoredAuth() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        currentToken = prefs.getString(KEY_AUTH_TOKEN, null)
        currentSelfId = prefs.getString(KEY_SELF_ID, null)
        if (!currentToken.isNullOrBlank()) {
            connectWebSocket()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        Log.d(TAG, "onStartCommand action: $action")

        when (action) {
            ACTION_STOP -> {
                isDestroyed = true
                disconnectWebSocket()
                @Suppress("DEPRECATION")
                stopForeground(true)
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_UPDATE_AUTH -> {
                val token = intent?.getStringExtra(EXTRA_TOKEN)
                val userId = intent?.getStringExtra(EXTRA_USER_ID)
                if (!token.isNullOrBlank()) {
                    currentToken = token
                    currentSelfId = userId
                    if (isConnected && webSocket != null) {
                        authenticateWebSocket(token)
                    } else {
                        connectWebSocket()
                    }
                }
            }

            ACTION_START -> {
                if (!currentToken.isNullOrBlank() && !isConnected) {
                    connectWebSocket()
                }
            }
        }

        return START_STICKY
    }

    private fun getClient(): OkHttpClient {
        return okHttpClient ?: OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build().also { okHttpClient = it }
    }

    private fun connectWebSocket() {
        if (isDestroyed) return
        val token = currentToken
        if (token.isNullOrBlank()) {
            Log.d(TAG, "connectWebSocket skipped: no auth token")
            return
        }

        disconnectWebSocket()

        try {
            Log.d(TAG, "Connecting to LieCord WebSocket: $WS_URL")
            val request = Request.Builder()
                .url(WS_URL)
                .build()

            getClient().newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.d(TAG, "WebSocket connected successfully")
                    this@LieCordPushService.webSocket = webSocket
                    isConnected = true
                    authenticateWebSocket(token)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleSocketMessage(text)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WebSocket closing: $code / $reason")
                    isConnected = false
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WebSocket closed: $code / $reason")
                    isConnected = false
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "WebSocket failure: ${t.message}")
                    isConnected = false
                    scheduleReconnect()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "connectWebSocket error: ${e.message}")
            scheduleReconnect()
        }
    }

    private fun authenticateWebSocket(token: String) {
        val authPayload = JSONObject().apply {
            put("type", "Authenticate")
            put("token", token)
        }
        webSocket?.send(authPayload.toString())
        Log.d(TAG, "Sent WebSocket Authenticate frame")
    }

    private fun disconnectWebSocket() {
        try {
            webSocket?.close(1000, "Normal closure")
            webSocket = null
            isConnected = false
        } catch (e: Exception) {
            Log.e(TAG, "disconnectWebSocket error: ${e.message}")
        }
    }

    private fun scheduleReconnect() {
        if (isDestroyed) return
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({
            if (!isConnected && !isDestroyed && !currentToken.isNullOrBlank()) {
                Log.d(TAG, "Attempting reconnect...")
                connectWebSocket()
            }
        }, 5000L)
    }

    private fun cacheUserJson(userObj: JSONObject) {
        val id = userObj.optString("_id").ifBlank { userObj.optString("id") }
        if (id.isBlank()) return
        val username = userObj.optString("username")
        val displayName = userObj.optString("display_name").ifBlank { username }
        val avatarObj = userObj.optJSONObject("avatar")
        val avatarUrl = if (avatarObj != null) {
            val tag = avatarObj.optString("tag")
            val fileId = avatarObj.optString("_id")
            if (tag.isNotBlank() && fileId.isNotBlank()) {
                "$AUTUMN_URL/$tag/$fileId?max_side=256"
            } else null
        } else null

        val finalName = displayName.ifBlank { username.ifBlank { "Пользователь" } }
        userProfileCache[id] = Pair(finalName, avatarUrl)
    }

    private fun handleSocketMessage(jsonText: String) {
        try {
            val json = JSONObject(jsonText)
            val type = json.optString("type")

            when (type) {
                "Ready" -> {
                    val usersArr = json.optJSONArray("users")
                    if (usersArr != null) {
                        for (i in 0 until usersArr.length()) {
                            val userObj = usersArr.optJSONObject(i) ?: continue
                            cacheUserJson(userObj)
                        }
                    }
                }

                "UserUpdate" -> {
                    val id = json.optString("id")
                    val data = json.optJSONObject("data")
                    if (id.isNotBlank() && data != null) {
                        fetchUserProfile(id) { _, _ -> }
                    }
                }

                "Ping" -> {
                    val data = json.opt("data") ?: 0
                    val pong = JSONObject().apply {
                        put("type", "Pong")
                        put("data", data)
                    }
                    webSocket?.send(pong.toString())
                }

                "Message" -> {
                    handleNewMessage(json)
                }

                "ChannelAck" -> {
                    val channelId = json.optString("id")
                    val userId = json.optString("user")
                    if (userId == currentSelfId && channelId.isNotBlank()) {
                        Log.d(TAG, "ChannelAck for self: dismissing notifications for $channelId")
                        NotificationManagerCompat.from(this).cancel(
                            channelId,
                            NotificationID.NEW_MESSAGE
                        )
                    }
                }

                "VoiceChannelJoin" -> {
                    val channelId = json.optString("id")
                    val userId = json.optString("user").ifBlank {
                        json.optJSONObject("state")?.optString("id") ?: ""
                    }
                    if (userId == currentSelfId && channelId.isNotBlank()) {
                        Log.d(TAG, "Self joined voice on another device: dismissing incoming call for $channelId")
                        CallNotificationManager.dismissIncomingCall(this, channelId)
                    } else if (userId.isNotBlank() && userId != currentSelfId && channelId.isNotBlank()) {
                        Log.d(TAG, "Incoming call detected in background from user $userId in channel $channelId")
                        resolveUserInfo(userId) { name, avatarUrl ->
                            CallNotificationManager.showIncomingCall(
                                context = this,
                                channelId = channelId,
                                callerId = userId,
                                callerName = name,
                                avatarUrl = avatarUrl
                            )
                        }
                    }
                }

                "VoiceChannelLeave" -> {
                    val channelId = json.optString("id")
                    if (channelId.isNotBlank()) {
                        CallNotificationManager.dismissIncomingCall(this, channelId)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleSocketMessage error: ${e.message}", e)
        }
    }

    private fun resolveUserInfo(userId: String, callback: (name: String, avatarUrl: String?) -> Unit) {
        val cached = userProfileCache[userId]
        if (cached != null) {
            callback(cached.first, cached.second)
            return
        }

        fetchUserProfile(userId, callback)
    }

    private fun fetchUserProfile(userId: String, callback: (name: String, avatarUrl: String?) -> Unit) {
        val token = currentToken
        if (token.isNullOrBlank()) {
            callback("Пользователь", null)
            return
        }

        val request = Request.Builder()
            .url("$API_URL/users/$userId")
            .header("x-session-token", token)
            .build()

        getClient().newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Failed to fetch user $userId: ${e.message}")
                handler.post { callback("Пользователь", null) }
            }

            override fun onResponse(call: Call, response: Response) {
                try {
                    val bodyString = response.body?.string() ?: ""
                    if (response.isSuccessful && bodyString.isNotBlank()) {
                        val userObj = JSONObject(bodyString)
                        cacheUserJson(userObj)
                        val pair = userProfileCache[userId]
                        handler.post {
                            callback(pair?.first ?: "Пользователь", pair?.second)
                        }
                    } else {
                        handler.post { callback("Пользователь", null) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing user response: ${e.message}")
                    handler.post { callback("Пользователь", null) }
                }
            }
        })
    }

    private fun handleNewMessage(json: JSONObject) {
        val author = json.optString("author")
        if (author.isNotBlank() && author == currentSelfId) {
            return
        }

        val channelId = json.optString("channel").ifBlank { "general" }
        val messageId = json.optString("_id").ifBlank { System.currentTimeMillis().toString() }
        val content = json.optString("content")

        val masquerade = json.optJSONObject("masquerade")
        val masqName = masquerade?.optString("name")?.takeIf { it.isNotBlank() }
        val masqAvatar = masquerade?.optString("avatar")?.takeIf { it.isNotBlank() }

        val bodyText = content.ifBlank { "Новое сообщение" }

        if (masqName != null) {
            presentMessageNotification(
                channelId = channelId,
                messageId = messageId,
                title = masqName,
                body = bodyText,
                avatarUrl = masqAvatar
            )
        } else {
            resolveUserInfo(author) { resolvedName, avatarUrl ->
                presentMessageNotification(
                    channelId = channelId,
                    messageId = messageId,
                    title = resolvedName,
                    body = bodyText,
                    avatarUrl = avatarUrl
                )
            }
        }
    }

    private fun presentMessageNotification(
        channelId: String,
        messageId: String,
        title: String,
        body: String,
        avatarUrl: String? = null
    ) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    return
                }
            }

            val intent = Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra("channelId", channelId)
                putExtra("messageId", messageId)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }

            val pendingIntent = PendingIntent.getActivity(
                this,
                channelId.hashCode(),
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            fun buildAndNotify(avatarBitmap: Bitmap?) {
                val builder = NotificationCompat.Builder(
                    this,
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

                if (avatarBitmap != null) {
                    builder.setLargeIcon(avatarBitmap)
                }

                NotificationManagerCompat.from(this).notify(
                    channelId,
                    NotificationID.NEW_MESSAGE,
                    builder.build()
                )
                Log.d(TAG, "Presented background message notification from $title: $body")
            }

            if (!avatarUrl.isNullOrBlank()) {
                Glide.with(this)
                    .asBitmap()
                    .load(avatarUrl)
                    .circleCrop()
                    .into(object : CustomTarget<Bitmap>(128, 128) {
                        override fun onResourceReady(
                            resource: Bitmap,
                            transition: Transition<in Bitmap>?
                        ) {
                            buildAndNotify(resource)
                        }

                        override fun onLoadCleared(placeholder: Drawable?) {
                            buildAndNotify(null)
                        }

                        override fun onLoadFailed(errorDrawable: Drawable?) {
                            buildAndNotify(null)
                        }
                    })
            } else {
                buildAndNotify(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "presentMessageNotification error: ${e.message}", e)
        }
    }

    override fun onDestroy() {
        isDestroyed = true
        disconnectWebSocket()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
    }
}
