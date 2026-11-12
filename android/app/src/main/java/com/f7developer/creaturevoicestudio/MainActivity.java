package com.f7developer.creaturevoicestudio;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Creature Voice Studio host activity. Everything runs inside the WebView from bundled assets:
 * the wasm voice engine, the AudioWorklet and the 3D anatomy. No network is used.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        WebSettings s = webView.getSettings();
        // rendered clips play as soon as they finish incubating
        s.setMediaPlaybackRequiresUserGesture(false);
        // the app is self-contained: block any accidental remote fetch at the WebView level too
        s.setBlockNetworkLoads(true);
        s.setTextZoom(100);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        // keep the screen awake while the lab is open in the foreground (long renders, live play)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
