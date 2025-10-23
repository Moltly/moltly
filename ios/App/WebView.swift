import SwiftUI
import WebKit
import UniformTypeIdentifiers
import SafariServices

struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.customUserAgent = "Moltly iOS"

        // Pull to refresh
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.onRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // no-op
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate, UINavigationControllerDelegate {
        var parent: WebView
        weak var webView: WKWebView?

        init(_ parent: WebView) {
            self.parent = parent
        }

        // Pull-to-refresh handler
        @objc func onRefresh(_ sender: UIRefreshControl) {
            webView?.reload()
            sender.endRefreshing()
        }

        // Allow all http(s) in-app for smoother auth flows; open non-web schemes externally
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let scheme = targetURL.scheme?.lowercased()
            if scheme == "http" || scheme == "https" {
                decisionHandler(.allow)
                return
            }
            UIApplication.shared.open(targetURL)
            decisionHandler(.cancel)
        }

        // Handle new windows (target=_blank) by loading in same view
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }

        // File input support
        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
            let types: [UTType] = [.item]
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types)
            picker.allowsMultipleSelection = parameters.allowsMultipleSelection
            picker.delegate = self

            // Store completion handler using associated object so we can call it after selection
            objc_setAssociatedObject(picker, &AssociatedKeys.completionHandler, completionHandler, .OBJC_ASSOCIATION_COPY_NONATOMIC)

            topViewController()?.present(picker, animated: true)
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            let handler = objc_getAssociatedObject(controller, &AssociatedKeys.completionHandler) as? ([URL]?) -> Void
            handler?(nil)
            objc_setAssociatedObject(controller, &AssociatedKeys.completionHandler, nil, .OBJC_ASSOCIATION_COPY_NONATOMIC)
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            let handler = objc_getAssociatedObject(controller, &AssociatedKeys.completionHandler) as? ([URL]?) -> Void
            handler?(urls)
            objc_setAssociatedObject(controller, &AssociatedKeys.completionHandler, nil, .OBJC_ASSOCIATION_COPY_NONATOMIC)
        }

        private struct AssociatedKeys { static var completionHandler = "wkCompletionHandler" }

        private func topViewController(base: UIViewController? = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }.first) -> UIViewController? {
            if let nav = base as? UINavigationController { return topViewController(base: nav.visibleViewController) }
            if let tab = base as? UITabBarController { return topViewController(base: tab.selectedViewController) }
            if let presented = base?.presentedViewController { return topViewController(base: presented) }
            return base
        }
    }
}
