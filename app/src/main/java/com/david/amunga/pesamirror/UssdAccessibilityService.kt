package com.david.amunga.pesamirror

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

class UssdAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { SecurePrefs.get(this) }

    private val phonePackages = setOf(
        "com.android.phone",
        "com.google.android.dialer",
        "com.android.dialer",
        "com.samsung.android.dialer",
        "com.google.android.contacts"
    )

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkg = event.packageName?.toString() ?: return
        val allowedPkg = pkg in phonePackages || pkg.contains("phone") || pkg.contains("dialer") ||
            pkg.contains("telecom") || pkg == "android" || pkg.startsWith("com.android.")
        if (!allowedPkg) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) return

        if (!prefs.getBoolean(MainActivity.KEY_USSD_PENDING, false)) return

        val state = prefs.getString(MainActivity.KEY_USSD_STATE, "") ?: ""
        if (state == STATE_DONE) return

        val root = getUssdDialogRoot() ?: return

        if (state.isEmpty() || state == STATE_DONE) {
            val mode = prefs.getString(MainActivity.KEY_USSD_MODE, MainActivity.MODE_SEND_MONEY) ?: MainActivity.MODE_SEND_MONEY
            val firstState = when (mode) {
                MainActivity.MODE_SEND_MONEY -> SM_1
                MainActivity.MODE_POCHI -> POCHI_1
                MainActivity.MODE_TILL -> TILL_6
                MainActivity.MODE_PAYBILL -> PB_6
                MainActivity.MODE_WITHDRAW -> WD_2
                else -> SM_1
            }
            prefs.edit().putString(MainActivity.KEY_USSD_STATE, firstState).apply()
            handler.removeCallbacks(timeoutRunnable)
            handler.postDelayed(timeoutRunnable, TIMEOUT_MS)
            handler.removeCallbacks(stepRunnable)
            handler.postDelayed(stepRunnable, INITIAL_DELAY_MS)
            return
        }

        handler.removeCallbacks(stepRunnable)
        handler.post(stepRunnable)
    }

    private val stepRunnable = object : Runnable {
        override fun run() {
            processNextStep()
        }
    }

    private val timeoutRunnable: Runnable = Runnable {
        handler.removeCallbacks(closeUssdAfterResultRunnable)
        prefs.edit().putBoolean(MainActivity.KEY_USSD_PENDING, false)
            .putString(MainActivity.KEY_USSD_STATE, STATE_DONE).apply()
    }

    /** After success/failure message appears (1–3 s), close the USSD menu with BACK. */
    private val closeUssdAfterResultRunnable: Runnable = Runnable {
        handler.removeCallbacks(timeoutRunnable)
        prefs.edit().putBoolean(MainActivity.KEY_USSD_PENDING, false)
            .putString(MainActivity.KEY_USSD_STATE, STATE_DONE).apply()
        performGlobalAction(GLOBAL_ACTION_BACK)
    }

    private fun processNextStep() {
        if (!prefs.getBoolean(MainActivity.KEY_USSD_PENDING, false)) return
        val root = getUssdDialogRoot() ?: return
        val state = prefs.getString(MainActivity.KEY_USSD_STATE, "") ?: ""

        fun typeAndSend(digit: String, nextState: String): Boolean {
            if (!typeInInputAndSend(root, digit)) return false
            prefs.edit().putString(MainActivity.KEY_USSD_STATE, nextState).apply()
            scheduleNext(STEP_DELAY_MS)
            return true
        }

        fun typeField(value: String, nextState: String, vararg hintKeywords: String): Boolean {
            if (value.isBlank()) return false
            if (!setTextOnFocusedOrFirstEditable(root, value) && !setTextOnNodeWithHint(root, value, *hintKeywords)) return false
            clickSendOrOk(root)
            prefs.edit().putString(MainActivity.KEY_USSD_STATE, nextState).apply()
            scheduleNext(STEP_DELAY_MS)
            return true
        }

        fun finishPin(): Boolean {
            val pin = prefs.getString(MainActivity.KEY_USSD_PIN, "") ?: ""
            // Prefer the field that matches "Enter M-PESA PIN" (hint/description) so we don't
            // type into the wrong editable or trigger CONFIRM "1" into the PIN box.
            val pinSet = setTextOnNodeWithHint(root, pin, "pin", "mpesa", "enter") ||
                setTextOnFocusedOrFirstEditable(root, pin)
            if (!pinSet) return false
            clickSendOrOk(root)
            val confirmSend = prefs.getBoolean(MainActivity.KEY_CONFIRM_SEND, false)
            if (confirmSend) {
                prefs.edit().putString(MainActivity.KEY_USSD_STATE, STATE_CONFIRM_1).putInt(KEY_CONFIRM_RETRY, 0).apply()
                scheduleNext(CONFIRM_DELAY_MS)
            } else {
                handler.removeCallbacks(closeUssdAfterResultRunnable)
                handler.postDelayed(closeUssdAfterResultRunnable, RESULT_THEN_CLOSE_DELAY_MS)
            }
            return true
        }

            when (state) {
            // --- Send Money: 1 -> 1 -> phone -> amount -> pin ---
            SM_1 -> typeAndSend("1", SM_2)
            SM_2 -> typeAndSend("1", SM_PHONE)
            SM_PHONE -> typeField(prefs.getString(MainActivity.KEY_USSD_PHONE, "") ?: "", SM_AMOUNT, "phone", "number")
            SM_AMOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_AMOUNT, "") ?: "", SM_PIN, "amount")
            SM_PIN -> finishPin()

            // --- Pochi la Biashara: 1 -> 3 -> phone -> amount -> pin ---
            POCHI_1 -> typeAndSend("1", POCHI_3)
            POCHI_3 -> typeAndSend("3", POCHI_PHONE)
            POCHI_PHONE -> typeField(prefs.getString(MainActivity.KEY_USSD_PHONE, "") ?: "", POCHI_AMOUNT, "phone", "number")
            POCHI_AMOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_AMOUNT, "") ?: "", POCHI_PIN, "amount")
            POCHI_PIN -> finishPin()

            // --- Till (Lipa na M-PESA): 6 -> 2 -> till -> amount -> pin ---
            TILL_6 -> typeAndSend("6", TILL_2)
            TILL_2 -> typeAndSend("2", TILL_NUM)
            TILL_NUM -> typeField(prefs.getString(MainActivity.KEY_USSD_TILL, "") ?: "", TILL_AMOUNT, "till", "goods")
            TILL_AMOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_AMOUNT, "") ?: "", TILL_PIN, "amount")
            TILL_PIN -> finishPin()

            // --- Paybill: 6 -> 1 -> business -> account -> amount -> pin ---
            PB_6 -> typeAndSend("6", PB_1)
            PB_1 -> typeAndSend("1", PB_BUSINESS)
            PB_BUSINESS -> typeField(prefs.getString(MainActivity.KEY_USSD_BUSINESS, "") ?: "", PB_ACCOUNT, "business", "paybill")
            PB_ACCOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_ACCOUNT, "") ?: "", PB_AMOUNT, "account")
            PB_AMOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_AMOUNT, "") ?: "", PB_PIN, "amount")
            PB_PIN -> finishPin()

            // --- Withdraw: 2 -> 1 -> agent -> store -> amount -> pin ---
            WD_2 -> typeAndSend("2", WD_1)
            WD_1 -> typeAndSend("1", WD_AGENT)
            WD_AGENT -> typeField(prefs.getString(MainActivity.KEY_USSD_AGENT, "") ?: "", WD_STORE, "agent")
            WD_STORE -> typeField(prefs.getString(MainActivity.KEY_USSD_STORE, "") ?: "", WD_AMOUNT, "store")
            WD_AMOUNT -> typeField(prefs.getString(MainActivity.KEY_USSD_AMOUNT, "") ?: "", WD_PIN, "amount")
            WD_PIN -> finishPin()

            STATE_CONFIRM_1 -> {
                // Don't type "1" (confirm) if PIN dialog is still visible—would insert "1" into PIN field.
                if (rootContainsAnyText(root, listOf("Enter M-PESA PIN", "Enter M-Pesa PIN", "Enter PIN"))) {
                    scheduleNext(STEP_DELAY_MS)
                    return
                }
                if (typeInInputAndSend(root, "1")) {
                    handler.removeCallbacks(closeUssdAfterResultRunnable)
                    handler.postDelayed(closeUssdAfterResultRunnable, RESULT_THEN_CLOSE_DELAY_MS)
                } else {
                    val retry = prefs.getInt(KEY_CONFIRM_RETRY, 0)
                    if (retry < CONFIRM_MAX_RETRIES) {
                        prefs.edit().putInt(KEY_CONFIRM_RETRY, retry + 1).apply()
                        scheduleNext(STEP_DELAY_MS)
                    }
                }
            }

            STATE_DONE -> {}
            else -> {}
        }
    }

    private fun scheduleNext(delayMs: Long) {
        handler.postDelayed(stepRunnable, delayMs)
    }

    private val ussdMarkers = listOf("SEND", "CANCEL", "Send Money", "Withdraw Cash", "Yes", "No", "To continue")

    private fun isOurAppRoot(root: AccessibilityNodeInfo?): Boolean {
        val pkg = root?.packageName?.toString() ?: return true
        return pkg == packageName
    }

    /**
     * Finds the root node of the USSD dialog only. Never returns our app's window so we don't
     * type into PesaMirror's fields (e.g. PIN). Only dialer/phone/telecom USSD UI is used.
     */
    private fun getUssdDialogRoot(): AccessibilityNodeInfo? {
        val active = rootInActiveWindow
        if (active != null && !isOurAppRoot(active) && rootContainsAnyText(active, ussdMarkers)) {
            return active
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val windowList = windows ?: return null
            var lastMatch: AccessibilityNodeInfo? = null
            for (window in windowList) {
                val root = window.root ?: continue
                if (isOurAppRoot(root)) continue
                if (rootContainsAnyText(root, ussdMarkers)) lastMatch = root
            }
            if (lastMatch != null) return lastMatch
        }
        return null
    }

    private fun rootContainsAnyText(node: AccessibilityNodeInfo, texts: List<String>): Boolean {
        val t = node.text?.toString()?.trim() ?: ""
        val d = node.contentDescription?.toString()?.trim() ?: ""
        if (texts.any { it in t || it in d }) return true
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { if (rootContainsAnyText(it, texts)) return true }
        }
        return false
    }

    /** Types text into the USSD input field and taps SEND (for menu options like "1"). */
    private fun typeInInputAndSend(root: AccessibilityNodeInfo, text: String): Boolean {
        if (!setTextOnFocusedOrFirstEditable(root, text)) return false
        clickSendOrOk(root)
        return true
    }

    private fun clickNodeWithText(root: AccessibilityNodeInfo, text: String): Boolean {
        val nodes = mutableListOf<AccessibilityNodeInfo>()
        collectNodesWithText(root, text, nodes)
        for (node in nodes) {
            if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            var parent = node.parent
            while (parent != null) {
                if (parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                parent = parent.parent
            }
        }
        return false
    }

    private fun collectNodesWithText(
        node: AccessibilityNodeInfo,
        text: String,
        out: MutableList<AccessibilityNodeInfo>
    ) {
        val nodeText = node.text?.toString()?.trim() ?: ""
        val desc = node.contentDescription?.toString()?.trim() ?: ""
        val match = when (text) {
            "1" -> nodeText == "1" || desc == "1" ||
                nodeText.startsWith("1.") || nodeText.startsWith("1 ") ||
                desc.startsWith("1.") || desc.startsWith("1 ")
            else -> nodeText == text || desc == text
        }
        if (match) out.add(node)
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectNodesWithText(it, text, out) }
        }
    }

    private fun collectNodesWithTextContains(
        node: AccessibilityNodeInfo,
        substring: String,
        out: MutableList<AccessibilityNodeInfo>
    ) {
        val nodeText = node.text?.toString()?.trim() ?: ""
        val desc = node.contentDescription?.toString()?.trim() ?: ""
        if (nodeText.contains(substring) || desc.contains(substring)) out.add(node)
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectNodesWithTextContains(it, substring, out) }
        }
    }

    private fun setTextOnFocusedOrFirstEditable(
        root: AccessibilityNodeInfo,
        text: String
    ): Boolean {
        var target: AccessibilityNodeInfo? = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (target == null) {
            val editables = mutableListOf<AccessibilityNodeInfo>()
            collectEditableNodes(root, editables)
            target = editables.firstOrNull()
        }
        if (target == null) {
            target = findFirstFocusableInput(root)
        }
        if (target == null) {
            target = findFirstFocusableInRoot(root)
        }
        return target?.let { setTextOnNode(it, text) } == true
    }

    private fun findFirstFocusableInput(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val className = node.className?.toString() ?: ""
        if (node.isFocusable && (node.isEditable || className.contains("EditText", ignoreCase = true))) {
            return node
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { findFirstFocusableInput(it) }?.let { return it }
        }
        return null
    }

    private fun findFirstFocusableInRoot(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isFocusable && node.className?.toString().orEmpty().contains("Edit", ignoreCase = true)) {
            return node
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { findFirstFocusableInRoot(it) }?.let { return it }
        }
        return null
    }

    private fun setTextOnNodeWithHint(
        root: AccessibilityNodeInfo,
        text: String,
        vararg keywords: String
    ): Boolean {
        val editables = mutableListOf<AccessibilityNodeInfo>()
        collectEditableNodes(root, editables)
        val lower = keywords.map { it.lowercase(Locale.getDefault()) }
        for (node in editables) {
            val hint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                node.hintText?.toString()?.lowercase(Locale.getDefault()) ?: ""
            } else {
                ""
            }
            val desc = node.contentDescription?.toString()?.lowercase(Locale.getDefault()) ?: ""
            if (lower.any { hint.contains(it) || desc.contains(it) }) {
                if (setTextOnNode(node, text)) return true
            }
        }
        return false
    }

    private fun collectEditableNodes(
        node: AccessibilityNodeInfo,
        out: MutableList<AccessibilityNodeInfo>
    ) {
        if (node.isEditable) out.add(node)
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectEditableNodes(it, out) }
        }
    }

    private fun setTextOnNode(node: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun clickSendOrOk(root: AccessibilityNodeInfo) {
        val sendOk = listOf("Send", "OK", "Submit", "Confirm", "SEND", "Ok")
        for (label in sendOk) {
            if (clickNodeWithText(root, label)) return
        }
    }

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val info = serviceInfo
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            serviceInfo = info
        }
        handler.postDelayed({
            if (prefs.getBoolean(MainActivity.KEY_USSD_PENDING, false)) {
                val state = prefs.getString(MainActivity.KEY_USSD_STATE, "") ?: ""
                if (state.isNotEmpty() && state != STATE_DONE) {
                    processNextStep()
                }
            }
        }, TIMEOUT_CHECK_MS)
    }

    companion object {
        private const val SM_1 = "SM_1"
        private const val SM_2 = "SM_2"
        private const val SM_PHONE = "SM_PHONE"
        private const val SM_AMOUNT = "SM_AMOUNT"
        private const val SM_PIN = "SM_PIN"
        private const val POCHI_1 = "POCHI_1"
        private const val POCHI_3 = "POCHI_3"
        private const val POCHI_PHONE = "POCHI_PHONE"
        private const val POCHI_AMOUNT = "POCHI_AMOUNT"
        private const val POCHI_PIN = "POCHI_PIN"
        private const val TILL_6 = "TILL_6"
        private const val TILL_2 = "TILL_2"
        private const val TILL_NUM = "TILL_NUM"
        private const val TILL_AMOUNT = "TILL_AMOUNT"
        private const val TILL_PIN = "TILL_PIN"
        private const val PB_6 = "PB_6"
        private const val PB_1 = "PB_1"
        private const val PB_BUSINESS = "PB_BUSINESS"
        private const val PB_ACCOUNT = "PB_ACCOUNT"
        private const val PB_AMOUNT = "PB_AMOUNT"
        private const val PB_PIN = "PB_PIN"
        private const val WD_2 = "WD_2"
        private const val WD_1 = "WD_1"
        private const val WD_AGENT = "WD_AGENT"
        private const val WD_STORE = "WD_STORE"
        private const val WD_AMOUNT = "WD_AMOUNT"
        private const val WD_PIN = "WD_PIN"
        private const val STATE_CONFIRM_1 = "CONFIRM_1"
        private const val STATE_DONE = "DONE"
        private const val KEY_CONFIRM_RETRY = "confirm_retry"
        private const val CONFIRM_MAX_RETRIES = 8
        private const val INITIAL_DELAY_MS = 1200L
        private const val STEP_DELAY_MS = 650L
        private const val CONFIRM_DELAY_MS = 1500L
        /** Delay after pressing 1 (or after PIN when no confirm) before closing USSD menu (1–3 s). */
        private const val RESULT_THEN_CLOSE_DELAY_MS = 2000L
        private const val TIMEOUT_MS = 60_000L
        private const val TIMEOUT_CHECK_MS = 60_000L
    }
}
