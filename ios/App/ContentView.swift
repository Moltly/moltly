import SwiftUI

struct ContentView: View {
    private var baseURL: URL {
        if let urlString = Bundle.main.object(forInfoDictionaryKey: "BASE_URL") as? String,
           let url = URL(string: urlString) {
            return url
        }
        return URL(string: "https://moltly.xyz")!
    }

    var body: some View {
        WebView(url: baseURL)
            .ignoresSafeArea()
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}

