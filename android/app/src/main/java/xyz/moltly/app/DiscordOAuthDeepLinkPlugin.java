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
  private static final String OAUTH_PATH = "/oauth2/authorize";

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

    // Discord's Android app does not register https://discord.com OAuth links,
    // so rewrite the authorize URL to the discord://-/ deep link scheme that
    // the native app handles. iOS will still handle the original https link
    // via universal links, but Android needs this conversion.
    final Uri deepLinkUri = maybeDeepLink(uri);
    final Context context = getContext();
    final PackageManager pm = context.getPackageManager();

    // Prefer opening the Discord app if it's installed
    if (launchWithPackage(context, pm, deepLinkUri, DISCORD_PACKAGE)) {
      return true;
    }
    if (launchWithPackage(context, pm, deepLinkUri, DISCORD_BETA_PACKAGE)) {
      return true;
    }

    // No native Discord app; allow the WebView to load normally.
    return null;
  }

  private Uri maybeDeepLink(Uri uri) {
    final String path = uri.getPath();
    if (path == null) return uri;

    final String normalizedPath = path.toLowerCase(Locale.US);
    if (!normalizedPath.startsWith(OAUTH_PATH)) {
      return uri;
    }

    return uri.buildUpon().scheme("discord").authority("-").build();
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
