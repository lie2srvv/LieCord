package chat.stoat.c2dm

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import chat.stoat.BuildConfig
import chat.stoat.R
import chat.stoat.activities.MainActivity
import chat.stoat.api.StoatAPI
import chat.stoat.api.internals.ULID
import chat.stoat.api.routes.channel.fetchSingleChannel
import chat.stoat.api.routes.server.fetchMember
import chat.stoat.api.routes.user.fetchUser
import chat.stoat.c2dm.ChannelRegistrator.Companion.CHANNEL_ID_GROUP_CONVERSATIONS_MESSAGES
import chat.stoat.core.model.data.STOAT_FILES
import chat.stoat.core.model.schemas.Message
import chat.stoat.persistence.Database
import chat.stoat.persistence.KVStorage
import chat.stoat.persistence.SqlStorage
import com.bumptech.glide.Glide
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import logcat.LogPriority
import logcat.logcat
import kotlin.math.abs

private val LETTER_ICON_COLORS = intArrayOf(
    0xFF1565C0.toInt(),
    0xFF2E7D32.toInt(),
    0xFF6A1B9A.toInt(),
    0xFFC62828.toInt(),
    0xFF00838F.toInt(),
    0xFFE65100.toInt(),
    0xFF4527A0.toInt(),
    0xFF283593.toInt(),
)

fun generateLetterBitmap(name: String, sizePx: Int = 256): Bitmap {
    val letter = name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val color = LETTER_ICON_COLORS[abs(name.hashCode()) % LETTER_ICON_COLORS.size]

    val bitmap = createBitmap(sizePx, sizePx)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    paint.color = color
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, paint)

    paint.color = Color.WHITE
    paint.textSize = sizePx * 0.45f
    paint.textAlign = Paint.Align.CENTER
    paint.typeface = Typeface.DEFAULT_BOLD
    val bounds = Rect()
    paint.getTextBounds(letter, 0, 1, bounds)
    canvas.drawText(letter, sizePx / 2f, sizePx / 2f + bounds.height() / 2f - bounds.bottom, paint)

    return bitmap
}

object NotificationPresenter {
    var activeViewedChannelId: String? = null

    fun onMessageReceivedFromSocket(context: Context, message: Message) {
        val channelId = message.channel ?: return
        val messageId = message.id ?: return
        val authorId = message.author ?: return

        // Do not notify for self messages
        val selfId = StoatAPI.selfId?.takeIf { it.isNotEmpty() } ?: runBlocking {
            runCatching { KVStorage(context).get("selfId") }.getOrNull().orEmpty()
        }
        if (selfId.isNotEmpty() && authorId == selfId) return

        // Do not notify if the user is actively viewing this channel in foreground
        val isForeground = runCatching {
            ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        }.getOrDefault(false)

        if (isForeground && activeViewedChannelId == channelId) {
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                var authorUser = StoatAPI.userCache[authorId]
                if (authorUser == null) {
                    authorUser = runCatching { fetchUser(authorId) }.getOrNull()
                }

                val db = Database(SqlStorage.driver)
                val dbChannel = db.channelQueries.findById(channelId).executeAsOneOrNull()
                val serverId = dbChannel?.server

                val serverMember = if (serverId != null) {
                    StoatAPI.members.getMember(serverId, authorId)
                        ?: runCatching { fetchMember(serverId, authorId) }.getOrNull()
                } else null

                val authorName = message.masquerade?.name
                    ?: serverMember?.nickname
                    ?: authorUser?.displayName
                    ?: authorUser?.username
                    ?: "User"

                val authorAvatarUrl = message.masquerade?.avatar
                    ?: serverMember?.avatar?.let { "$STOAT_FILES/avatars/${it.id}" }
                    ?: authorUser?.avatar?.let { "$STOAT_FILES/avatars/${it.id}" }

                val body = message.content?.takeIf { it.isNotBlank() }
                    ?: if (!message.attachments.isNullOrEmpty()) "📷 Attachment" else "New message"

                val timestamp = runCatching { ULID.asTimestamp(messageId) }.getOrDefault(System.currentTimeMillis())

                showNotification(
                    context = context,
                    channelId = channelId,
                    messageId = messageId,
                    authorId = authorId,
                    authorName = authorName,
                    authorAvatarUrl = authorAvatarUrl,
                    body = body,
                    messageTimestamp = timestamp
                )
            } catch (e: Exception) {
                logcat(LogPriority.ERROR) { "Error presenting notification: ${e.message}" }
            }
        }
    }

    fun showNotification(
        context: Context,
        channelId: String,
        messageId: String,
        authorId: String,
        authorName: String,
        authorAvatarUrl: String?,
        body: String,
        messageTimestamp: Long
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
        }

        val db = Database(SqlStorage.driver)

        fun serverPrefix(serverId: String?): String? {
            if (serverId == null) return null
            return db.serverQueries.findById(serverId).executeAsOneOrNull()?.name
        }

        fun formatChannelName(type: String, name: String?, serverId: String?): String {
            val base = when (type) {
                "DirectMessage" -> return authorName
                "TextChannel" -> "#${name}"
                else -> name ?: return authorName
            }
            val prefix = serverPrefix(serverId) ?: return base
            return "$prefix · $base"
        }

        val channelName = db.channelQueries.findById(channelId).executeAsOneOrNull()?.let {
            formatChannelName(it.channelType, it.name, it.server)
        } ?: runBlocking {
            runCatching { fetchSingleChannel(channelId) }.getOrNull()?.let {
                formatChannelName(
                    it.channelType?.value ?: "",
                    it.name,
                    it.server
                )
            } ?: authorName
        }

        fun loadBitmap(url: String): Bitmap = Glide.with(context)
            .asBitmap()
            .load(url)
            .circleCrop()
            .submit()
            .get()

        val kv = KVStorage(context)
        val selfId = runBlocking { kv.get("selfId") }.orEmpty()
        val selfName = runBlocking { kv.get("selfName") }.orEmpty()
        val selfAvatarUrl = runBlocking { kv.get("selfAvatarUrl") }

        val selfBitmap: Bitmap = if (!selfAvatarUrl.isNullOrEmpty()) {
            runCatching { loadBitmap(selfAvatarUrl) }.getOrNull()
                ?: generateLetterBitmap(selfName.ifEmpty { "?" })
        } else {
            generateLetterBitmap(selfName.ifEmpty { "?" })
        }

        val self = Person.Builder()
            .setBot(false)
            .setKey(selfId.ifEmpty { "self" })
            .setIcon(IconCompat.createWithBitmap(selfBitmap))
            .setName(selfName.ifEmpty { "Me" })
            .build()

        val dbChannel = db.channelQueries.findById(channelId).executeAsOneOrNull()

        val authorBitmap = if (!authorAvatarUrl.isNullOrEmpty()) {
            runCatching { loadBitmap(authorAvatarUrl) }.getOrElse { generateLetterBitmap(authorName) }
        } else {
            generateLetterBitmap(authorName)
        }

        val conversationBitmap: Bitmap = when (dbChannel?.channelType) {
            "TextChannel", "VoiceChannel" -> {
                val server =
                    dbChannel.server?.let { db.serverQueries.findById(it).executeAsOneOrNull() }
                val iconUrl = server?.iconId?.let { "$STOAT_FILES/icons/$it" }
                iconUrl?.let { runCatching { loadBitmap(it) }.getOrNull() }
                    ?: generateLetterBitmap(server?.name ?: channelName)
            }

            "Group" -> {
                val iconUrl = dbChannel.iconId?.let { "$STOAT_FILES/icons/$it" }
                iconUrl?.let { runCatching { loadBitmap(it) }.getOrNull() }
                    ?: generateLetterBitmap(dbChannel.name ?: channelName)
            }

            else -> authorBitmap
        }

        val author = Person.Builder()
            .setBot(false)
            .setKey(authorId)
            .setIcon(IconCompat.createWithBitmap(authorBitmap))
            .setName(authorName)
            .build()

        val shortcutId = "${BuildConfig.APPLICATION_ID}.channel.$channelId"

        val conversationIntent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            putExtra("channelId", channelId)
            putExtra("messageId", messageId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val shortcut = ShortcutInfoCompat.Builder(context, shortcutId)
            .setShortLabel(channelName)
            .setLongLabel(channelName)
            .setIcon(IconCompat.createWithBitmap(conversationBitmap))
            .setIntent(conversationIntent)
            .setLongLived(true)
            .setPerson(author)
            .build()

        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)

        val remoteInput = RemoteInput.Builder("content")
            .setLabel(context.getString(R.string.message_context_sheet_actions_reply))
            .build()

        val replyIntent = Intent(context, ReplyReceiver::class.java).apply {
            putExtra("channelId", channelId)
        }

        val replyAction: NotificationCompat.Action =
            NotificationCompat.Action.Builder(
                R.drawable.ic_reply_24dp,
                context.getString(R.string.message_context_sheet_actions_reply),
                PendingIntent.getBroadcast(
                    context,
                    channelId.hashCode(),
                    replyIntent,
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
                .addRemoteInput(remoteInput)
                .build()

        val markAsReadIntent = Intent(context, MarkAsReadReceiver::class.java).apply {
            putExtra("channelId", channelId)
            putExtra("messageId", messageId)
        }

        val markAsReadAction: NotificationCompat.Action =
            NotificationCompat.Action.Builder(
                R.drawable.ic_mark_chat_read_24dp,
                context.getString(R.string.channel_context_sheet_actions_mark_read),
                PendingIntent.getBroadcast(
                    context,
                    channelId.hashCode() xor 1,
                    markAsReadIntent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
                .build()

        val contentIntent = PendingIntent.getActivity(
            context,
            channelId.hashCode(),
            conversationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val existingStyle = NotificationManagerCompat.from(context)
            .activeNotifications
            .firstOrNull { it.tag == channelId && it.id == NotificationID.NEW_MESSAGE }
            ?.notification
            ?.let { NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(it) }

        val messagingStyle = (existingStyle ?: NotificationCompat.MessagingStyle(self))
            .setGroupConversation(dbChannel?.channelType != "DirectMessage")
            .setConversationTitle(channelName)
            .addMessage(body, messageTimestamp, author)

        val isDirectMessage = dbChannel?.channelType == "DirectMessage"
        val headerTitle = if (isDirectMessage) authorName else channelName
        val headerLargeIcon = if (isDirectMessage) authorBitmap else conversationBitmap

        val builder = NotificationCompat.Builder(context, CHANNEL_ID_GROUP_CONVERSATIONS_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification_monochrome)
            .setColor(0xFF3C639A.toInt())
            .setContentTitle(headerTitle)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setStyle(messagingStyle)
            .setLargeIcon(headerLargeIcon)
            .addAction(replyAction)
            .addAction(markAsReadAction)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)

        // Android 11 bubbles
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setShortcutId(shortcutId)
            builder.setLocusId(LocusIdCompat(shortcutId))

            val bubbleIntent = PendingIntent.getActivity(
                context,
                channelId.hashCode(),
                conversationIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val bubbleMetadata = NotificationCompat.BubbleMetadata.Builder(
                bubbleIntent,
                IconCompat.createWithBitmap(conversationBitmap)
            )
                .setDesiredHeight(600)
                .setAutoExpandBubble(false)
                .setSuppressNotification(false)
                .build()

            builder.setBubbleMetadata(bubbleMetadata)
        }

        NotificationManagerCompat.from(context).apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ActivityCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
            notify(channelId, NotificationID.NEW_MESSAGE, builder.build())
        }
    }
}
