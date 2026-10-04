package com.clubyuppie.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android has no auto-discovery for local (non-npm) plugins the way
    // iOS does (CAPBridgedPlugin conformance is enough there) — this has
    // to run before super.onCreate(), which an instance initializer block
    // guarantees. See ExternalLinkPlugin.java.
    {
        registerPlugin(ExternalLinkPlugin.class);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showCometRing();
    }

    // Capacitor's SplashScreen plugin (see
    // node_modules/@capacitor/splash-screen's Android SplashScreen.java)
    // shows the splash by delaying the Activity's own content view's first
    // draw pass (an OnPreDrawListener on android.R.id.content that returns
    // false) for the full launchShowDuration. During that window the only
    // thing that actually renders is the window's own android:background
    // (@drawable/splash, the wordmark-on-yellow bitmap from styles.xml's
    // AppTheme.NoActionBarLaunch) — that's composited by the system
    // independently of the (blocked) content view tree. A normal View
    // added to that content hierarchy would be blocked right along with
    // the WebView and never actually render during the splash window.
    //
    // A Dialog gets its own, separate window, so it isn't subject to that
    // block and can animate immediately — the same mechanism Capacitor's
    // own legacy spinner dialog uses (see showDialog() in the plugin
    // above). This shows the bespoke comet ring, the Android counterpart
    // of ios/App/App/CometSpinnerView.swift, layered on top of the static
    // background for exactly Capacitor's own splash window
    // (launchShowDuration + launchFadeOutDuration from
    // capacitor.config.ts) so it's never cut off mid-spin or left
    // stranded after the web content appears.
    private void showCometRing() {
        float density = getResources().getDisplayMetrics().density;
        int ringSizePx = Math.round(64 * density);
        int offsetYPx = Math.round(115 * density);

        CometRingView ring = new CometRingView(this);
        FrameLayout.LayoutParams ringParams = new FrameLayout.LayoutParams(ringSizePx, ringSizePx);
        ringParams.gravity = Gravity.CENTER;
        ringParams.topMargin = offsetYPx;

        FrameLayout root = new FrameLayout(this);
        root.addView(ring, ringParams);

        Dialog dialog = new Dialog(this, android.R.style.Theme_Translucent_NoTitleBar_Fullscreen);
        dialog.setContentView(root);
        dialog.setCancelable(false);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT);
        }

        if (isFinishing()) {
            return;
        }
        dialog.show();

        // Matches capacitor.config.ts's SplashScreen plugin config:
        // launchShowDuration (3000ms) + launchFadeOutDuration (300ms).
        long showDuration = 3000;
        long fadeOutDuration = 300;
        new Handler(getMainLooper()).postDelayed(() -> {
            if (isFinishing() || !dialog.isShowing()) {
                return;
            }
            ObjectAnimator fade = ObjectAnimator.ofFloat(root, "alpha", 1f, 0f);
            fade.setDuration(fadeOutDuration);
            fade.setInterpolator(new LinearInterpolator());
            fade.addListener(
                new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        if (!isFinishing()) {
                            dialog.dismiss();
                        }
                    }
                }
            );
            fade.start();
        }, showDuration);
    }
}
