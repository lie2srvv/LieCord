package chat.stoat.c2dm

import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.content.ContextCompat.getSystemService
import chat.stoat.R

class ChannelRegistrator(val context: Context) {
    companion object {
        const val CHANNEL_ID_GROUP_CONVERSATIONS = "chat.stoat.c2dm.conversations"
        const val CHANNEL_ID_GROUP_CONVERSATIONS_MESSAGES =
            "chat.stoat.c2dm.conversations.messages"

        const val CHANNEL_ID_GROUP_SOCIAL = "chat.stoat.c2dm.social"
        const val CHANNEL_ID_GROUP_SOCIAL_FRIENDREQUESTS = "chat.stoat.c2dm.social.friendrequests"

        const val CHANNEL_ID_GROUP_VOICE = "chat.stoat.voice"
        const val CHANNEL_ID_GROUP_VOICE_ONGOING = "chat.stoat.voice.ongoing"
        const val CHANNEL_ID_GROUP_VOICE_INCOMING = "chat.stoat.voice.incoming"

        const val CHANNEL_ID_SERVICE_STATUS = "chat.stoat.service.status"
    }

    private val notificationManager =
        getSystemService(context, NotificationManager::class.java) as NotificationManager

    private fun registerGroups() {
        notificationManager.createNotificationChannelGroup(
            NotificationChannelGroup(
                CHANNEL_ID_GROUP_CONVERSATIONS,
                context.getString(R.string.notification_channel_group_conversations)
            )
        )
        notificationManager.createNotificationChannelGroup(
            NotificationChannelGroup(
                CHANNEL_ID_GROUP_SOCIAL,
                context.getString(R.string.notification_channel_group_social)
            )
        )
        notificationManager.createNotificationChannelGroup(
            NotificationChannelGroup(
                CHANNEL_ID_GROUP_VOICE,
                context.getString(R.string.notification_channel_group_voice)
            )
        )
    }

    private fun registerChannels() {
        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID_GROUP_SOCIAL_FRIENDREQUESTS,
                context.getString(R.string.notification_channel_friend_requests),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                group = CHANNEL_ID_GROUP_SOCIAL
                description =
                    context.getString(R.string.notification_channel_friend_requests_description)
            }
        )
        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID_GROUP_CONVERSATIONS_MESSAGES,
                context.getString(R.string.notification_channel_messages),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                group = CHANNEL_ID_GROUP_CONVERSATIONS
                description =
                    context.getString(R.string.notification_channel_messages_description)
                enableVibration(true)
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
        )
        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID_GROUP_VOICE_ONGOING,
                context.getString(R.string.notification_channel_ongoing_call),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                group = CHANNEL_ID_GROUP_VOICE
                description =
                    context.getString(R.string.notification_channel_ongoing_call_description)
                setSound(null, null)
                enableVibration(false)
            }
        )

        // Incoming Call Channel with dedicated ringtone and vibration loop
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build()

        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID_GROUP_VOICE_INCOMING,
                "Входящие звонки",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                group = CHANNEL_ID_GROUP_VOICE
                description = "Уведомления о входящих голосовых и видео звонках"
                setSound(ringtoneUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 800, 1000, 800)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
        )

        // Silent persistent service notification channel
        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID_SERVICE_STATUS,
                "Фоновая служба LieCord",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                group = CHANNEL_ID_GROUP_CONVERSATIONS
                description = "Служба фонового подключения и моментальной доставки уведомлений"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }
        )
    }

    fun register() {
        registerGroups()
        registerChannels()
    }
}
