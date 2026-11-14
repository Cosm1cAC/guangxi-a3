package cloud.vibelink.a3;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private String safeAreaScript = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 牌局中等别人出牌时不熄屏
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 画面延伸到刘海 / 挖孔区域，页面用 CSS 安全区避让
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }
        watchInsets();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** 沉浸式全屏：隐藏状态栏和导航栏，从屏幕边缘滑动可临时唤出。 */
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    /**
     * Capacitor 自带的边距处理已在 capacitor.config.json 关闭（它会在挖孔屏顶部留一条空带）。
     * 这里自己做两件事：把挖孔区域的高度交给页面的 CSS 变量；键盘弹出时把页面底部让出来。
     */
    private void watchInsets() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(0, 0, 0, insets.isVisible(WindowInsetsCompat.Type.ime()) ? ime.bottom : 0);
            float density = getResources().getDisplayMetrics().density;
            safeAreaScript = String.format(
                Locale.US,
                "document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-left','%dpx');" +
                "document.documentElement.style.setProperty('--safe-area-inset-right','%dpx');",
                (int) (cutout.top / density), (int) (cutout.left / density), (int) (cutout.right / density)
            );
            injectSafeArea();
            return insets;
        });
        // 页面加载完成后再注入一次：边距回调可能早于页面就绪
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                injectSafeArea();
            }
        });
    }

    private void injectSafeArea() {
        if (bridge == null || bridge.getWebView() == null || safeAreaScript.isEmpty()) return;
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.evaluateJavascript(safeAreaScript, null));
    }
}
