package com.david.amunga.pesamirror

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import android.widget.Toast

/**
 * Receives SMS and triggers USSD when:
 * - SMS trigger is enabled in app settings
 * - Sender matches one of the allowed phone numbers
 * - Body matches a known pattern (SM|..., BG|..., PB|..., WA|...)
 * Uses the M-Pesa PIN stored in app prefs.
 */
class SmsTriggerReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val prefs = SecurePrefs.get(context)
        if (!prefs.getBoolean(MainActivity.KEY_SMS_TRIGGER_ENABLED, false)) return

        val allowedSenders = prefs.getString(MainActivity.KEY_SMS_ALLOWED_SENDERS, null)
            ?.split(",")
            ?.map { it.trim().normalizePhone() }
            ?.filter { it.isNotBlank() }
            ?: return
        if (allowedSenders.isEmpty()) return

        val pin = prefs.getString(MainActivity.KEY_USSD_PIN, null)?.trim()
        if (pin.isNullOrBlank()) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val first = (messages as? Array<*>)?.firstOrNull() as? SmsMessage ?: return
        val sender = first.originatingAddress?.trim()?.normalizePhone() ?: return
        if (sender !in allowedSenders) return

        val body = (messages as? Array<SmsMessage>)?.joinToString("") { it.messageBody?.toString().orEmpty() }?.trim()
            ?: (messages as Array<*>).joinToString("") { (it as? SmsMessage)?.messageBody?.toString().orEmpty() }.trim()
        if (body.isBlank()) return

        val parts = body.split("|").map { it.trim() }
        when {
            parts[0].equals("SM", ignoreCase = true) && parts.size >= 2 -> {
                // SM|amount (phone = sender) or SM|phone|amount
                val phone: String
                val amount: String
                if (parts.size >= 3) {
                    phone = parts[1].trim()
                    amount = parts[2].trim()
                } else {
                    phone = sender
                    amount = parts.getOrNull(1).orEmpty().trim()
                }
                if (amount.isNotBlank() && phone.isNotBlank()) {
                    startUssdFromSms(context, prefs, MainActivity.MODE_SEND_MONEY, pin, amount,
                        phone = phone
                    )
                }
            }
            parts.size >= 3 && parts[0].equals("PLB", ignoreCase = true) -> {
                // PLB|phone|amount — Pochi la Biashara
                val phone = parts.getOrNull(1).orEmpty().trim()
                val amount = parts.getOrNull(2).orEmpty().trim()
                if (phone.isNotBlank() && amount.isNotBlank()) {
                    startUssdFromSms(context, prefs, MainActivity.MODE_POCHI, pin, amount, phone = phone)
                }
            }
            parts.size >= 3 && parts[0].equals("BG", ignoreCase = true) -> {
                val till = parts.getOrNull(1).orEmpty()
                val amount = parts.getOrNull(2).orEmpty()
                if (till.isNotBlank() && amount.isNotBlank()) {
                    startUssdFromSms(context, prefs, MainActivity.MODE_TILL, pin, amount, till = till)
                }
            }
            parts.size >= 4 && parts[0].equals("PB", ignoreCase = true) -> {
                val business = parts.getOrNull(1).orEmpty()
                val amount = parts.getOrNull(2).orEmpty()
                val account = parts.getOrNull(3).orEmpty()
                if (business.isNotBlank() && amount.isNotBlank() && account.isNotBlank()) {
                    startUssdFromSms(context, prefs, MainActivity.MODE_PAYBILL, pin, amount,
                        business = business, account = account
                    )
                }
            }
            parts.size >= 4 && parts[0].equals("WA", ignoreCase = true) -> {
                val agent = parts.getOrNull(1).orEmpty()
                val amount = parts.getOrNull(2).orEmpty()
                val store = parts.getOrNull(3).orEmpty()
                if (agent.isNotBlank() && amount.isNotBlank() && store.isNotBlank()) {
                    startUssdFromSms(context, prefs, MainActivity.MODE_WITHDRAW, pin, amount,
                        agent = agent, store = store
                    )
                }
            }
        }
    }

    private fun startUssdFromSms(
        context: Context,
        prefs: android.content.SharedPreferences,
        mode: String,
        pin: String,
        amount: String,
        phone: String = "",
        till: String = "",
        business: String = "",
        account: String = "",
        agent: String = "",
        store: String = ""
    ) {
        prefs.edit()
            .putBoolean(MainActivity.KEY_USSD_PENDING, true)
            .putString(MainActivity.KEY_USSD_STATE, "")
            .putString(MainActivity.KEY_USSD_MODE, mode)
            .putString(MainActivity.KEY_USSD_AMOUNT, amount)
            .putString(MainActivity.KEY_USSD_PIN, pin)
            .putString(MainActivity.KEY_USSD_PHONE, phone)
            .putString(MainActivity.KEY_USSD_TILL, till)
            .putString(MainActivity.KEY_USSD_BUSINESS, business)
            .putString(MainActivity.KEY_USSD_ACCOUNT, account)
            .putString(MainActivity.KEY_USSD_AGENT, agent)
            .putString(MainActivity.KEY_USSD_STORE, store)
            .apply()

        val uri = Uri.parse("tel:" + Uri.encode("*334#"))
        val callIntent = Intent(Intent.ACTION_CALL).setData(uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(callIntent)
            Toast.makeText(context, "Starting...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            prefs.edit().putBoolean(MainActivity.KEY_USSD_PENDING, false).apply()
            Log.e(TAG, "Failed to start USSD from SMS", e)
        }
    }

    private fun String.normalizePhone(): String = replace(Regex("^\\+?254"), "0").filter { it.isDigit() || it == '+' }.trim()

    companion object {
        private const val TAG = "SmsTriggerReceiver"
    }
}
