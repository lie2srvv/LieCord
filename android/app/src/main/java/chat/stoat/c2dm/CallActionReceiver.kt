package chat.stoat.c2dm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

object CallEvents {
    @Volatile
    var onCallDeclined: ((channelId: String?) -> Unit)? = null

    @Volatile
    var onCallAccepted: ((channelId: String) -> Unit)? = null
}

class CallActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_DECLINE = "chat.stoat.ACTION_DECLINE_CALL"
        const val ACTION_ACCEPT = "chat.stoat.ACTION_ACCEPT_CALL"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val channelId = intent.getStringExtra("channelId")

        Log.d("CallActionReceiver", "Received call action: $action for channel: $channelId")

        when (action) {
            ACTION_DECLINE -> {
                CallNotificationManager.dismissIncomingCall(context, channelId)
                CallEvents.onCallDeclined?.invoke(channelId)
            }
        }
    }
}
