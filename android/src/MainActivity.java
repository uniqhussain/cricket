package app.turfcricket.mobile;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final String HOST = "cricket-pi-lac.vercel.app";
    private static final String HOME = "https://" + HOST + "/mobile";
    private static final int CHOOSE_PHOTO = 1;
    private static final int BACKGROUND = Color.rgb(14, 25, 23);

    private WebView web;
    private ProgressBar progress;
    private LinearLayout connectionError;
    private ValueCallback<Uri[]> photoCallback;

    @Override
    public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(BACKGROUND);
        if (Build.VERSION.SDK_INT >= 35) {
            screen.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        }

        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        configureWebView();
        screen.addView(web, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        screen.addView(progress, new FrameLayout.LayoutParams(-1, dp(4), Gravity.TOP));
        connectionError = connectionErrorView();
        screen.addView(connectionError, new FrameLayout.LayoutParams(-1, -1));
        connectionError.setVisibility(View.GONE);

        setContentView(screen);
        screen.requestApplyInsets();
        if (savedState == null || web.restoreState(savedState) == null) web.loadUrl(HOME);
    }

    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppUrl(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnectionError();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showConnectionError();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int percent) {
                progress.setProgress(percent);
                progress.setVisibility(percent < 100 && connectionError.getVisibility() != View.VISIBLE
                    ? View.VISIBLE : View.GONE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                try { startActivityForResult(picker, CHOOSE_PHOTO); }
                catch (android.content.ActivityNotFoundException noPicker) { completePhoto(null); }
                return true;
            }
        });
    }

    private static boolean isAppUrl(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private LinearLayout connectionErrorView() {
        LinearLayout panel = new LinearLayout(this);
        panel.setBackgroundColor(BACKGROUND);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(24), dp(24), dp(24), dp(24));
        TextView message = new TextView(this);
        message.setText("Couldn’t open Turf Cricket. Check your connection and try again.");
        message.setTextSize(17);
        message.setGravity(Gravity.CENTER);
        panel.addView(message);
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(view -> {
            panel.setVisibility(View.GONE);
            web.loadUrl(HOME);
        });
        LinearLayout.LayoutParams button = new LinearLayout.LayoutParams(-2, -2);
        button.topMargin = dp(16);
        panel.addView(retry, button);
        return panel;
    }

    private void showConnectionError() {
        connectionError.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
    }

    private void completePhoto(Uri[] result) {
        if (photoCallback == null) return;
        ValueCallback<Uri[]> pending = photoCallback;
        photoCallback = null;
        pending.onReceiveValue(result);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != CHOOSE_PHOTO) return;
        Uri selected = result == RESULT_OK && data != null ? data.getData() : null;
        completePhoto(selected != null && "content".equals(selected.getScheme()) ? new Uri[] { selected } : null);
    }

    @Override
    public void onBackPressed() {
        if (connectionError.getVisibility() != View.VISIBLE && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        completePhoto(null);
        ((FrameLayout) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
