import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private func configurePasskeySupport() {
        guard let bridgeVC = self.window?.rootViewController as? CAPBridgeViewController else { return }
        guard let webView = bridgeVC.bridge?.webView else { return }

        // App-bound domains are required for WebAuthn/passkeys inside WKWebView.
        if #available(iOS 14.0, *) {
            webView.configuration.limitsNavigationsToAppBoundDomains = true
        }
    }

    private func injectStatusBarOverlayFix() {
        guard let bridgeVC = self.window?.rootViewController as? CAPBridgeViewController else { return }
        configurePasskeySupport()
        let js = """
        (function() {
          function setOverlayFalse(){
            try {
              var sb = (window && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar);
              if (sb && sb.setOverlaysWebView) { sb.setOverlaysWebView({ overlay: false }); return true; }
            } catch (e) {}
            return false;
          }
          if (!setOverlayFalse()) {
            var t = setInterval(function(){ if (setOverlayFalse()) { clearInterval(t); } }, 200);
            setTimeout(function(){ clearInterval(t); }, 5000);
          }
        })();
        """
        let userScript = WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        bridgeVC.bridge?.webView?.configuration.userContentController.addUserScript(userScript)
        bridgeVC.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        injectStatusBarOverlayFix()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        injectStatusBarOverlayFix()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
