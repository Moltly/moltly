package xyz.moltly.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import java.util.Locale;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DiscordOAuthDeepLink")
public class DiscordOAuthDeepLinkPlugin extends Plugin {
  private static final String DISCORD_PACKAGE = "com.discord";
  private static final String DISCORD_BETA_PACKAGE = "com.discord.beta";

  @Override
  public Boolean shouldOverrideLoad(Uri uri) {
    if (uri == null) return null;
    final String host = uri.getHost();
    if (host == null) return null;
    final String normalized = host.toLowerCase(Locale.US);
    final boolean isDiscordHost = normalized.endsWith("discord.com") || normalized.endsWith("discordapp.com");
    if (!isDiscordHost) {
      return null;
    }

    final Context context = getContext();
    final PackageManager pm = context.getPackageManager();

    // Prefer opening the Discord app if it's installed
    if (launchWithPackage(context, pm, uri, DISCORD_PACKAGE)) {
      return true;
    }
    if (launchWithPackage(context, pm, uri, DISCORD_BETA_PACKAGE)) {
      return true;
    }

    // No native Discord app; allow the WebView to load normally.
    return null;
  }

  private boolean launchWithPackage(Context context, PackageManager pm, Uri uri, String pkg) {
    final Intent intent = new Intent(Intent.ACTION_VIEW, uri);
    intent.setPackage(pkg);
    if (intent.resolveActivity(pm) != null) {
      context.startActivity(intent);
      return true;
    }
    return false;
  }
}
