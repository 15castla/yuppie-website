package com.clubyuppie.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.util.DisplayMetrics;
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
    // Sized and centered to frame the wordmark baked into the splash
    // background (res/drawable*/splash.png), not just float below it.
    // The wordmark isn't a live view here — it's part of a static bitmap
    // set as android:background — so its on-screen geometry is derived
    // from the same fractions the wordmark pixels were placed at, for
    // portrait (wordmark_width_frac=0.47, vertical_center_frac=0.47),
    // confirmed against the actual shipped assets by measuring each
    // one's own non-background bounding box. The original 0.434
    // (matching a reference app's splash) read as sitting too high once
    // seen on a real device; every drawable*/splash.png variant — both
    // portrait and landscape, 26 density/orientation buckets in total —
    // was independently re-measured and re-baked (wordmark cropped out,
    // background flood-filled since it's flat #FFD904 with no gradient,
    // pasted back lower) so its own vertical center now lands at 0.47 of
    // its own height, and this constant moved to match. Re-measuring
    // also surfaced a pre-existing inconsistency worth recording: the
    // landscape variants were originally baked around 0.40 of their own
    // height, not 0.434 like portrait — since this constant is applied
    // at runtime regardless of orientation, landscape launches were
    // already slightly out of sync with the ring before this change; the
    // re-bake fixes that too, not just the portrait complaint. Unlike
    // iOS, each of these drawables is pre-generated at the exact pixel
    // dimensions of its target density/orientation bucket — no
    // scaleAspectFill-style cropping happens at runtime — so those
    // fractions translate directly to the live screen's own width/height,
    // no square-canvas correction needed.
    private void showCometRing() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float screenWidthPx = metrics.widthPixels;
        float screenHeightPx = metrics.heightPixels;

        float wordmarkWidthFraction = 0.47f;
        float wordmarkVerticalCenterFraction = 0.47f;
        float wordmarkWidthPx = wordmarkWidthFraction * screenWidthPx;
        // How much larger the ring's diameter is than the wordmark's
        // width — the wordmark's longer dimension — so the ring reads as
        // a loose circle framing it with visible breathing room on every
        // side, matching the reference (Reiss's app splash): the ring
        // isn't a tight circumscribe, it's a comfortably larger halo.
        // Matches ios/App/App/SceneDelegate.swift's ringPaddingFactor.
        float ringPaddingFactor = 1.4f;
        int ringSizePx = Math.round(wordmarkWidthPx * ringPaddingFactor);
        // Positions the ring's TOP edge (not its center) so that, once
        // its own height is accounted for, its center lands exactly on
        // the wordmark's vertical center — more precise than relying on
        // FrameLayout's CENTER gravity plus an offsetting margin.
        int topOffsetPx = Math.round(wordmarkVerticalCenterFraction * screenHeightPx - ringSizePx / 2f);

        CometRingView ring = new CometRingView(this);
        FrameLayout.LayoutParams ringParams = new FrameLayout.LayoutParams(ringSizePx, ringSizePx);
        ringParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        ringParams.topMargin = topOffsetPx;

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
