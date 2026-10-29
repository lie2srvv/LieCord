package chat.stoat.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import chat.stoat.R
import chat.stoat.screens.web.ScreenCaptureHelper

class ScreenCaptureService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("LieCordScreen", "ScreenCaptureService onStartCommand action: ${intent?.action}")
        if (intent?.action == ACTION_STOP) {
            ScreenCaptureHelper.stop()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            return START_NOT_STICKY
        }

        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LieCord")
            .setContentText("Трансляция экрана активна")
            .setSmallIcon(R.drawable.ic_notification_monochrome)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0

        @Suppress("DEPRECATION")
        val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        val targetWidth = intent?.getIntExtra(EXTRA_WIDTH, 720) ?: 720
        val targetFps = intent?.getIntExtra(EXTRA_FPS, 30) ?: 30

        Log.d("LieCordScreen", "ScreenCaptureService resultCode: $resultCode, hasData: ${resultData != null}")

        if (resultCode != 0 && resultData != null) {
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
            if (mpm != null) {
                try {
                    val mp = mpm.getMediaProjection(resultCode, resultData)
                    if (mp != null) {
                        Log.d("LieCordScreen", "ScreenCaptureService got MediaProjection successfully!")
                        ScreenCaptureHelper.onMediaProjectionReady(mp, this, targetWidth, targetFps)
                    } else {
                        Log.e("LieCordScreen", "ScreenCaptureService: getMediaProjection returned null")
                    }
                } catch (e: Exception) {
                    Log.e("LieCordScreen", "ScreenCaptureService error getting MediaProjection: ${e.message}", e)
                    stopSelf()
                }
            } else {
                Log.e("LieCordScreen", "ScreenCaptureService: MediaProjectionManager is null")
            }
        }

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Трансляция экрана",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Уведомление активной трансляции экрана"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "liecord_screen_capture"
        const val NOTIFICATION_ID = 4040
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_RESULT_DATA = "EXTRA_RESULT_DATA"
        const val EXTRA_WIDTH = "EXTRA_WIDTH"
        const val EXTRA_FPS = "EXTRA_FPS"

        fun startCapture(
            context: Context,
            resultCode: Int,
            resultData: Intent,
            targetWidth: Int = 720,
            targetFps: Int = 30
        ) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
                putExtra(EXTRA_WIDTH, targetWidth)
                putExtra(EXTRA_FPS, targetFps)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
