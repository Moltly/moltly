package xyz.moltly.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Ensure Discord OAuth tries the native app when available
    registerPlugin(DiscordOAuthDeepLinkPlugin.class);
    super.onCreate(savedInstanceState);
    // Reserve space for system bars (status/navigation) so
    // the WebView doesn't draw underneath the status bar.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
