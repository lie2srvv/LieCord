package chat.stoat.c2dm

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import chat.stoat.R
import chat.stoat.activities.MainActivity
import com.bumptech.glide.Glide
import com.bumptech.glide.request.target.CustomTarget
import com.bumptech.glide.request.transition.Transition

object CallNotificationManager {
    private const val TAG = "CallNotification"
    const val TAG_INCOMING_CALL = "incoming_call"

    fun showIncomingCall(
        context: Context,
        channelId: String,
        callerId: String,
        callerName: String,
        avatarUrl: String? = null
    ) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    Log.w(TAG, "POST_NOTIFICATIONS permission not granted")
                    return
                }
            }

            fun buildAndNotify(avatarBitmap: Bitmap?) {
                val acceptIntent = Intent(context, MainActivity::class.java).apply {
                    action = "chat.stoat.ACTION_ACCEPT_CALL"
                    putExtra("channelId", channelId)
                    putExtra("callerId", callerId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val acceptPendingIntent = PendingIntent.getActivity(
                    context,
                    101,
                    acceptIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )

                val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
                    action = "chat.stoat.ACTION_DECLINE_CALL"
                    putExtra("channelId", channelId)
                }
                val declinePendingIntent = PendingIntent.getBroadcast(
                    context,
                    102,
                    declineIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )

                val chatIntent = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    putExtra("channelId", channelId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val chatPendingIntent = PendingIntent.getActivity(
                    context,
                    103,
                    chatIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )

                val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

                val builder = NotificationCompat.Builder(
                    context,
                    ChannelRegistrator.CHANNEL_ID_GROUP_VOICE_INCOMING
                )
                    .setSmallIcon(R.drawable.ic_call_24dp__fill)
                    .setColor(0xFF2E7D32.toInt())
                    .setContentTitle(callerName.ifBlank { "Входящий звонок" })
                    .setContentText("Входящий голосовой вызов в LieCord")
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setSound(ringtoneUri)
                    .setVibrate(longArrayOf(0, 1000, 800, 1000, 800))
                    .setFullScreenIntent(acceptPendingIntent, true)
                    .setContentIntent(acceptPendingIntent)
                    .addAction(
                        R.drawable.ic_call_24dp__fill,
                        "Принять",
                        acceptPendingIntent
                    )
                    .addAction(
                        R.drawable.ic_call_end_24dp__fill,
                        "Отклонить",
                        declinePendingIntent
                    )
                    .addAction(
                        R.drawable.ic_notification_monochrome,
                        "Открыть чат",
                        chatPendingIntent
                    )

                if (avatarBitmap != null) {
                    builder.setLargeIcon(avatarBitmap)
                }

                NotificationManagerCompat.from(context).notify(
                    TAG_INCOMING_CALL,
                    NotificationID.INCOMING_CALL,
                    builder.build()
                )
                Log.d(TAG, "Incoming call notification presented for caller: $callerName")
            }

            if (!avatarUrl.isNullOrBlank()) {
                Glide.with(context)
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
            Log.e(TAG, "Failed to show incoming call notification: ${e.message}", e)
        }
    }

    fun dismissIncomingCall(context: Context, channelId: String? = null) {
        try {
            NotificationManagerCompat.from(context).cancel(
                TAG_INCOMING_CALL,
                NotificationID.INCOMING_CALL
            )
            Log.d(TAG, "Dismissed incoming call notification (channel: $channelId)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dismiss call notification: ${e.message}")
        }
    }
}
