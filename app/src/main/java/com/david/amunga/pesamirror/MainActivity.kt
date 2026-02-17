package com.david.amunga.pesamirror

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import android.view.accessibility.AccessibilityManager
import androidx.core.view.doOnPreDraw
import android.widget.FrameLayout
import android.widget.ArrayAdapter
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.textfield.MaterialAutoCompleteTextView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText

class MainActivity : AppCompatActivity() {

    private val requestCallPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startUssdFlow()
        else Snackbar.make(
            findViewById(android.R.id.content),
            "Phone call permission is required to run USSD.",
            Snackbar.LENGTH_LONG
        ).show()
    }

    private val requestSmsPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { map ->
        if (map.values.any { it }) {
            updateSmsTriggerState()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
        ensureDefaultsInInputs()
        setupTransactionTypeSelect()
        setupConfirmSendCheckbox()
        setupSmsTriggerSection()
        if (SecurePrefs.get(this).getBoolean(
                KEY_SMS_TRIGGER_ENABLED,
                false
            )
        ) {
            updateSmsTriggerState()
        }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.runUssdButton).setOnClickListener { onRunUssdClick() }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.accessibilitySettingsButton).setOnClickListener { openAccessibilitySettings() }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.aboutButton)?.setOnClickListener { showAbout() }
        showFirstLaunchWarningsIfNeeded()
        findViewById<View>(R.id.main).doOnPreDraw { maybeStartTutorial() }
    }

    override fun onPause() {
        super.onPause()
        savePinToPrefsForSms()
        saveAllowedSenders()
        saveConfirmSend()
    }

    private fun setupConfirmSendCheckbox() {
        val prefs = SecurePrefs.get(this)
        findViewById<MaterialCheckBox>(R.id.confirmSendCheckbox).apply {
            isChecked = prefs.getBoolean(KEY_CONFIRM_SEND, false)
            setOnCheckedChangeListener { _, isChecked ->
                prefs.edit().putBoolean(KEY_CONFIRM_SEND, isChecked).apply()
            }
        }
    }

    private fun saveConfirmSend() {
        val checked = findViewById<MaterialCheckBox>(R.id.confirmSendCheckbox).isChecked
        SecurePrefs.get(this).edit()
            .putBoolean(KEY_CONFIRM_SEND, checked).apply()
    }

    private fun savePinToPrefsForSms() {
        val pin = findViewById<TextInputEditText>(R.id.pinInput).text?.toString()?.trim()
        if (!pin.isNullOrBlank()) {
            SecurePrefs.get(this).edit()
                .putString(KEY_USSD_PIN, pin).apply()
        }
    }

    private fun setupSmsTriggerSection() {
        val prefs = SecurePrefs.get(this)
        findViewById<SwitchMaterial>(R.id.smsTriggerSwitch).isChecked =
            prefs.getBoolean(KEY_SMS_TRIGGER_ENABLED, false)
        findViewById<TextInputEditText>(R.id.smsAllowedSendersInput).setText(
            prefs.getString(
                KEY_SMS_ALLOWED_SENDERS,
                ""
            ) ?: ""
        )
        findViewById<SwitchMaterial>(R.id.smsTriggerSwitch).setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean(KEY_SMS_TRIGGER_ENABLED, isChecked).apply()
            saveAllowedSenders()
            updateSmsTriggerState()
        }
        findViewById<TextInputEditText>(R.id.smsAllowedSendersInput).setOnFocusChangeListener { _, _ -> saveAllowedSenders() }
    }

    private fun saveAllowedSenders() {
        val senders =
            findViewById<TextInputEditText>(R.id.smsAllowedSendersInput).text?.toString()?.trim()
                .orEmpty()
        SecurePrefs.get(this).edit()
            .putString(KEY_SMS_ALLOWED_SENDERS, senders).apply()
    }

    private fun updateSmsTriggerState() {
        val prefs = SecurePrefs.get(this)
        val enabled = prefs.getBoolean(KEY_SMS_TRIGGER_ENABLED, false)
        if (enabled) {
            val perms = mutableListOf<String>()
            if (checkSelfPermission(android.Manifest.permission.RECEIVE_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.RECEIVE_SMS)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                perms.add(android.Manifest.permission.POST_NOTIFICATIONS)
            }
            if (perms.isNotEmpty()) {
                requestSmsPermission.launch(perms.toTypedArray())
                return
            }
            startForegroundService(Intent(this, SmsTriggerService::class.java))
        } else {
            stopService(Intent(this, SmsTriggerService::class.java))
        }
    }

    private fun setupTransactionTypeSelect() {
        val select = findViewById<MaterialAutoCompleteTextView>(R.id.transactionTypeSelect)
        val phoneLayout = findViewById<View>(R.id.phoneLayout)
        val tillLayout = findViewById<View>(R.id.tillLayout)
        val businessLayout = findViewById<View>(R.id.businessLayout)
        val accountLayout = findViewById<View>(R.id.accountLayout)
        val agentLayout = findViewById<View>(R.id.agentLayout)
        val storeLayout = findViewById<View>(R.id.storeLayout)
        val items = listOf(
            getString(R.string.type_send_money),
            getString(R.string.type_pochi_biashara),
            getString(R.string.type_paybill),
            getString(R.string.type_till_number),
            getString(R.string.type_withdraw_cash)
        )
        val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, items)
        select.setAdapter(adapter)
        select.setText(getString(R.string.type_send_money), false)
        fun updateVisibility(mode: String) {
            when (mode) {
                MODE_SEND_MONEY, MODE_POCHI -> {
                    phoneLayout.visibility = View.VISIBLE
                    tillLayout.visibility = View.GONE
                    businessLayout.visibility = View.GONE
                    accountLayout.visibility = View.GONE
                    agentLayout.visibility = View.GONE
                    storeLayout.visibility = View.GONE
                }

                MODE_TILL -> {
                    phoneLayout.visibility = View.GONE
                    tillLayout.visibility = View.VISIBLE
                    businessLayout.visibility = View.GONE
                    accountLayout.visibility = View.GONE
                    agentLayout.visibility = View.GONE
                    storeLayout.visibility = View.GONE
                }

                MODE_PAYBILL -> {
                    phoneLayout.visibility = View.GONE
                    tillLayout.visibility = View.GONE
                    businessLayout.visibility = View.VISIBLE
                    accountLayout.visibility = View.VISIBLE
                    agentLayout.visibility = View.GONE
                    storeLayout.visibility = View.GONE
                }

                MODE_WITHDRAW -> {
                    phoneLayout.visibility = View.GONE
                    tillLayout.visibility = View.GONE
                    businessLayout.visibility = View.GONE
                    accountLayout.visibility = View.GONE
                    agentLayout.visibility = View.VISIBLE
                    storeLayout.visibility = View.VISIBLE
                }

                else -> {}
            }
        }
        select.setOnItemClickListener { _, _, position, _ ->
            updateVisibility(
                when (position) {
                    0 -> MODE_SEND_MONEY
                    1 -> MODE_POCHI
                    2 -> MODE_PAYBILL
                    3 -> MODE_TILL
                    4 -> MODE_WITHDRAW
                    else -> MODE_SEND_MONEY
                }
            )
        }
        updateVisibility(MODE_SEND_MONEY)
    }

    private fun ensureDefaultsInInputs() {
        // Do not pre-fill PIN on first start; user must set their own
        val savedPin = SecurePrefs.get(this).getString(KEY_USSD_PIN, null)?.trim()
        if (!savedPin.isNullOrEmpty() && findViewById<TextInputEditText>(R.id.pinInput).text.isNullOrBlank()) {
            findViewById<TextInputEditText>(R.id.pinInput).setText(savedPin)
        }
    }

    private fun getTransactionMode(): String {
        val text =
            findViewById<MaterialAutoCompleteTextView>(R.id.transactionTypeSelect).text?.toString()
                .orEmpty()
        return when {
            text == getString(R.string.type_send_money) -> MODE_SEND_MONEY
            text == getString(R.string.type_pochi_biashara) -> MODE_POCHI
            text == getString(R.string.type_paybill) -> MODE_PAYBILL
            text == getString(R.string.type_till_number) -> MODE_TILL
            text == getString(R.string.type_withdraw_cash) -> MODE_WITHDRAW
            else -> MODE_SEND_MONEY
        }
    }

    private fun onRunUssdClick() {
        if (!isAccessibilityServiceEnabled()) {
            Snackbar.make(
                findViewById(android.R.id.content),
                getString(R.string.enable_accessibility_message),
                Snackbar.LENGTH_LONG
            )
                .setAction("Settings") { openAccessibilitySettings() }
                .show()
            return
        }
        val amount = findViewById<TextInputEditText>(R.id.amountInput).text?.toString()?.trim()
        val pin = findViewById<TextInputEditText>(R.id.pinInput).text?.toString()?.trim()
        if (pin.isNullOrBlank()) {
            AlertDialog.Builder(this)
                .setTitle(R.string.pin_warning_title)
                .setMessage(R.string.pin_warning_message)
                .setPositiveButton(R.string.pin_warning_ok, null)
                .show()
            return
        }
        if (amount.isNullOrBlank()) {
            Snackbar.make(
                findViewById(android.R.id.content),
                getString(R.string.fill_required_fields),
                Snackbar.LENGTH_SHORT
            ).show()
            return
        }
        val mode = getTransactionMode()
        when (mode) {
            MODE_SEND_MONEY, MODE_POCHI -> {
                val phone =
                    findViewById<TextInputEditText>(R.id.phoneInput).text?.toString()?.trim()
                if (phone.isNullOrBlank()) {
                    Snackbar.make(
                        findViewById(android.R.id.content),
                        getString(R.string.fill_required_fields),
                        Snackbar.LENGTH_SHORT
                    ).show()
                    return
                }
            }

            MODE_TILL -> {
                val till = findViewById<TextInputEditText>(R.id.tillInput).text?.toString()?.trim()
                if (till.isNullOrBlank()) {
                    Snackbar.make(
                        findViewById(android.R.id.content),
                        getString(R.string.fill_required_fields),
                        Snackbar.LENGTH_SHORT
                    ).show()
                    return
                }
            }

            MODE_PAYBILL -> {
                val biz =
                    findViewById<TextInputEditText>(R.id.businessInput).text?.toString()?.trim()
                val acc =
                    findViewById<TextInputEditText>(R.id.accountInput).text?.toString()?.trim()
                if (biz.isNullOrBlank() || acc.isNullOrBlank()) {
                    Snackbar.make(
                        findViewById(android.R.id.content),
                        getString(R.string.fill_required_fields),
                        Snackbar.LENGTH_SHORT
                    ).show()
                    return
                }
            }

            MODE_WITHDRAW -> {
                val agent =
                    findViewById<TextInputEditText>(R.id.agentInput).text?.toString()?.trim()
                val store =
                    findViewById<TextInputEditText>(R.id.storeInput).text?.toString()?.trim()
                if (agent.isNullOrBlank() || store.isNullOrBlank()) {
                    Snackbar.make(
                        findViewById(android.R.id.content),
                        getString(R.string.fill_required_fields),
                        Snackbar.LENGTH_SHORT
                    ).show()
                    return
                }
            }
        }
        if (checkSelfPermission(android.Manifest.permission.CALL_PHONE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestCallPermission.launch(android.Manifest.permission.CALL_PHONE)
            return
        }
        startUssdFlow()
    }

    private fun startUssdFlow() {
        val prefs = SecurePrefs.get(this)
        val mode = getTransactionMode()
        val amount =
            findViewById<TextInputEditText>(R.id.amountInput).text?.toString()?.trim().orEmpty()
        val pin = findViewById<TextInputEditText>(R.id.pinInput).text?.toString()?.trim().orEmpty()
        if (amount.isBlank() || pin.isBlank()) return
        prefs.edit()
            .putBoolean(KEY_USSD_PENDING, true)
            .putString(KEY_USSD_STATE, "")
            .putString(KEY_USSD_MODE, mode)
            .putString(KEY_USSD_AMOUNT, amount)
            .putString(KEY_USSD_PIN, pin)
            .putString(
                KEY_USSD_PHONE,
                findViewById<TextInputEditText>(R.id.phoneInput).text?.toString()?.trim().orEmpty()
            )
            .putString(
                KEY_USSD_TILL,
                findViewById<TextInputEditText>(R.id.tillInput).text?.toString()?.trim().orEmpty()
            )
            .putString(
                KEY_USSD_BUSINESS,
                findViewById<TextInputEditText>(R.id.businessInput).text?.toString()?.trim()
                    .orEmpty()
            )
            .putString(
                KEY_USSD_ACCOUNT,
                findViewById<TextInputEditText>(R.id.accountInput).text?.toString()?.trim()
                    .orEmpty()
            )
            .putString(
                KEY_USSD_AGENT,
                findViewById<TextInputEditText>(R.id.agentInput).text?.toString()?.trim().orEmpty()
            )
            .putString(
                KEY_USSD_STORE,
                findViewById<TextInputEditText>(R.id.storeInput).text?.toString()?.trim().orEmpty()
            )
            .apply()
        val uri = Uri.parse("tel:" + Uri.encode(USSD_CODE))
        val intent = Intent(Intent.ACTION_CALL).setData(uri)
        try {
            startActivity(intent)
            Toast.makeText(this, getString(R.string.ussd_started), Toast.LENGTH_SHORT).show()
        } catch (e: SecurityException) {
            prefs.edit().putBoolean(KEY_USSD_PENDING, false).apply()
            Snackbar.make(
                findViewById(android.R.id.content),
                "Could not start call.",
                Snackbar.LENGTH_SHORT
            ).show()
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val am =
            getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
        val expectedComponent = ComponentName(this, UssdAccessibilityService::class.java)

        @Suppress("DEPRECATION")
        val enabledList =
            am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
        for (info in enabledList) {
            val svc = info.resolveInfo?.serviceInfo ?: continue
            if (ComponentName(svc.packageName, svc.name) == expectedComponent) return true
        }
        return false
    }

    private fun openAccessibilitySettings() {
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    private fun showFirstLaunchWarningsIfNeeded() {
        val prefs = SecurePrefs.get(this)
        if (prefs.getBoolean(KEY_FIRST_LAUNCH_DONE, false)) return
        prefs.edit().putBoolean(KEY_FIRST_LAUNCH_DONE, true).apply()
        AlertDialog.Builder(this)
            .setTitle(R.string.disclaimer_title)
            .setMessage(R.string.disclaimer_message)
            .setPositiveButton(android.R.string.ok, null)
            .show()
        val pin = prefs.getString(KEY_USSD_PIN, null)?.trim()
        if (pin.isNullOrEmpty()) {
            AlertDialog.Builder(this)
                .setTitle(R.string.pin_warning_title)
                .setMessage(R.string.pin_warning_message)
                .setPositiveButton(R.string.pin_warning_ok, null)
                .show()
        }
    }

    private fun showAbout() {
        val versionName = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
        } catch (_: Exception) {
            "1.0"
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.about_title)
            .setMessage(getString(R.string.about_message, versionName))
            .setPositiveButton(android.R.string.ok, null)
            .setNeutralButton(R.string.about_show_tutorial) { _, _ -> showTutorial() }
            .show()
    }

    private fun maybeStartTutorial() {
        if (SecurePrefs.get(this).getBoolean(KEY_TUTORIAL_SHOWN, false)) return
        SecurePrefs.get(this).edit().putBoolean(KEY_TUTORIAL_SHOWN, true).apply()
        showTutorial()
    }

    private fun showTutorial() {
        val typeView = findViewById<View>(R.id.transactionTypeLayout)
        val pinView = findViewById<View>(R.id.pinLayout)
        val runView = findViewById<View>(R.id.runUssdButton)
        val scrollView = findViewById<View>(R.id.main)
        if (typeView.width == 0 || pinView.width == 0) {
            typeView.post { showTutorial() }
            return
        }
        val steps = listOf(
            Triple(typeView, R.string.tutorial_transaction_title, R.string.tutorial_transaction_desc),
            Triple(pinView, R.string.tutorial_pin_title, R.string.tutorial_pin_desc),
            Triple(runView, R.string.tutorial_run_title, R.string.tutorial_run_desc),
        )
        var stepIndex = 0
        val overlayRoot = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.spotlight_background))
        }
        val tooltipCard = LayoutInflater.from(this).inflate(R.layout.spotlight_target, overlayRoot, false)
        val nextBtn = tooltipCard.findViewById<com.google.android.material.button.MaterialButton>(R.id.spotlightNext)
        val cardParams = FrameLayout.LayoutParams(
            (resources.displayMetrics.widthPixels * 0.85f).toInt().coerceAtLeast(200).coerceAtMost(320),
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { leftMargin = (resources.displayMetrics.widthPixels - (resources.displayMetrics.widthPixels * 0.85f).toInt()) / 2 }
        overlayRoot.addView(tooltipCard, cardParams)
        fun showStep() {
            if (stepIndex >= steps.size) {
                (overlayRoot.parent as? ViewGroup)?.removeView(overlayRoot)
                return
            }
            val (targetView, titleRes, descRes) = steps[stepIndex]
            tooltipCard.findViewById<TextView>(R.id.spotlightTitle).setText(titleRes)
            tooltipCard.findViewById<TextView>(R.id.spotlightDesc).setText(descRes)
            nextBtn.text = if (stepIndex == steps.size - 1) getString(R.string.tutorial_done) else getString(R.string.onboarding_next)
            nextBtn.setOnClickListener {
                stepIndex++
                showStep()
            }
            overlayRoot.post {
                val loc = IntArray(2)
                targetView.getLocationInWindow(loc)
                if (scrollView is androidx.core.widget.NestedScrollView) {
                    scrollView.smoothScrollTo(0, (loc[1] - scrollView.height / 3).coerceAtLeast(0))
                }
                overlayRoot.post {
                    targetView.getLocationInWindow(loc)
                    val cardHeight = 180
                    val isLastStep = stepIndex == steps.size - 1
                    cardParams.topMargin = if (isLastStep) {
                        (loc[1] - cardHeight - 24).coerceIn(24, overlayRoot.height - cardHeight - 24)
                    } else {
                        (loc[1] + targetView.height + 24).coerceIn(24, overlayRoot.height - cardHeight - 24)
                    }
                    tooltipCard.requestLayout()
                }
            }
        }
        overlayRoot.setOnClickListener {
            stepIndex++
            showStep()
        }
        val contentRoot = window.decorView.findViewById<ViewGroup>(android.R.id.content)
        overlayRoot.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        contentRoot.addView(overlayRoot)
        showStep()
    }

    companion object {
        const val PREFS_NAME = "ussd_prefs"
        const val KEY_USSD_PENDING = "ussd_pending"
        const val KEY_USSD_STATE = "ussd_state"
        const val KEY_USSD_MODE = "ussd_mode"
        const val KEY_USSD_PHONE = "ussd_phone"
        const val KEY_USSD_AMOUNT = "ussd_amount"
        const val KEY_USSD_PIN = "ussd_pin"
        const val KEY_USSD_TILL = "ussd_till"
        const val KEY_USSD_BUSINESS = "ussd_business"
        const val KEY_USSD_ACCOUNT = "ussd_account"
        const val KEY_USSD_AGENT = "ussd_agent"
        const val KEY_USSD_STORE = "ussd_store"
        const val KEY_SMS_TRIGGER_ENABLED = "sms_trigger_enabled"
        const val KEY_SMS_ALLOWED_SENDERS = "sms_allowed_senders"
        const val KEY_CONFIRM_SEND = "confirm_send"
        const val KEY_FIRST_LAUNCH_DONE = "first_launch_done"
        const val KEY_TUTORIAL_SHOWN = "tutorial_shown"
        const val MODE_SEND_MONEY = "SEND_MONEY"
        const val MODE_POCHI = "POCHI"
        const val MODE_PAYBILL = "PAYBILL"
        const val MODE_TILL = "TILL"
        const val MODE_WITHDRAW = "WITHDRAW"
        private const val USSD_CODE = "*334#"
    }
}
