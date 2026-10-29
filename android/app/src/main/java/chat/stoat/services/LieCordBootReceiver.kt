package chat.stoat.services

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class LieCordBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.d("LieCordBootReceiver", "Received boot event: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val prefs = context.getSharedPreferences(LieCordPushService.PREFS_NAME, Context.MODE_PRIVATE)
            val pushMode = prefs.getString(LieCordPushService.KEY_PUSH_MODE, "foreground")
            if (pushMode == "foreground") {
                Log.d("LieCordBootReceiver", "Auto-starting LieCordPushService after boot")
                LieCordPushService.start(context)
            }
        }
    }
}
