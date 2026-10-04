package com.clubyuppie.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.view.View;
import android.view.animation.LinearInterpolator;

// Bespoke splash-screen loading indicator: a thin stroked ring with a
// partial-opacity "comet" tail, continuously rotating -- the Android
// counterpart of ios/App/App/CometSpinnerView.swift. Replaces the generic
// system spinner Capacitor's SplashScreen plugin would otherwise show on
// its legacy dialog fallback path (capacitor.config.ts sets
// showSpinner: false).
//
// Built from a SweepGradient (Android's angular/conic gradient) on a
// stroked Paint, fading from transparent to opaque #1A1A1A around the
// circle -- the same hard seam at 0/360 degrees as the iOS version's
// CAGradientLayer, which is what produces the comet head's sharp cutoff
// against its own fading tail. Rotating the whole canvas produces the
// comet effect, mirroring iOS's whole-layer rotation transform.
final class CometRingView extends View {
    private static final int STROKE_COLOR = Color.parseColor("#1A1A1A");
    private static final float LINE_WIDTH_DP = 3f;
    // One full rotation every 1.5s divides launchShowDuration (3000ms,
    // see capacitor.config.ts) evenly -- two clean loops before the
    // splash starts fading out, rather than a loop getting cut off
    // abruptly mid-spin.
    private static final long ROTATION_DURATION_MS = 1500;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private ValueAnimator rotationAnimator;

    CometRingView(Context context) {
        super(context);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(LINE_WIDTH_DP * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w == 0 || h == 0) {
            return;
        }
        int transparent = Color.argb(0, 0x1A, 0x1A, 0x1A);
        int faint = Color.argb(Math.round(0.06f * 255), 0x1A, 0x1A, 0x1A);
        SweepGradient gradient = new SweepGradient(
            w / 2f,
            h / 2f,
            new int[] { transparent, faint, STROKE_COLOR, STROKE_COLOR },
            new float[] { 0f, 0.55f, 0.999f, 1f }
        );
        paint.setShader(gradient);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float strokeWidth = paint.getStrokeWidth();
        RectF bounds = new RectF(
            strokeWidth / 2f,
            strokeWidth / 2f,
            getWidth() - strokeWidth / 2f,
            getHeight() - strokeWidth / 2f
        );
        canvas.drawArc(bounds, 0f, 360f, false, paint);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startAnimating();
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (rotationAnimator != null) {
            rotationAnimator.cancel();
            rotationAnimator = null;
        }
    }

    private void startAnimating() {
        if (rotationAnimator != null) {
            return;
        }
        rotationAnimator = ValueAnimator.ofFloat(0f, 360f);
        rotationAnimator.setDuration(ROTATION_DURATION_MS);
        rotationAnimator.setRepeatCount(ValueAnimator.INFINITE);
        rotationAnimator.setInterpolator(new LinearInterpolator());
        rotationAnimator.addUpdateListener(animation -> setRotation((float) animation.getAnimatedValue()));
        rotationAnimator.start();
    }
}
