package chat.stoat.c2dm

import chat.stoat.api.internals.ULID
import chat.stoat.api.routes.push.subscribePush
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import logcat.LogPriority
import logcat.logcat

object NotificationID {
    const val NEW_MESSAGE = 0
}

class HandlerService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        runBlocking {
            runCatching { subscribePush(auth = token) }
        }
    }

    override fun onMessageReceived(fcmMessage: RemoteMessage) {
        val data = fcmMessage.data

        val type = data["type"]
        if (type != "push.message") {
            logcat(LogPriority.ERROR) { "Unknown message type: $type, abort" }
            return
        }

        val authorId = data["author"] ?: run {
            logcat(LogPriority.ERROR) { "No author in message, abort" }
            return
        }

        val body = data["body"] ?: run {
            logcat(LogPriority.ERROR) { "No body in message, abort" }
            return
        }

        val image = data["image"]
        val authorName = data["author_name"] ?: run {
            logcat(LogPriority.ERROR) { "No author name in message, abort" }
            return
        }

        val channelId = data["channel"] ?: run {
            logcat(LogPriority.ERROR) { "No channel in message, abort" }
            return
        }

        val messageId = data["message"] ?: run {
            logcat(LogPriority.ERROR) { "No message ID in message, abort" }
            return
        }

        val messageTimestamp = runCatching { ULID.asTimestamp(messageId) }.getOrDefault(System.currentTimeMillis())

        CoroutineScope(Dispatchers.IO).launch {
            try {
                NotificationPresenter.showNotification(
                    context = this@HandlerService,
                    channelId = channelId,
                    messageId = messageId,
                    authorId = authorId,
                    authorName = authorName,
                    authorAvatarUrl = image,
                    body = body,
                    messageTimestamp = messageTimestamp
                )
            } catch (e: Exception) {
                logcat(LogPriority.ERROR) { "Error presenting push notification: ${e.message}" }
            }
        }
    }
}
