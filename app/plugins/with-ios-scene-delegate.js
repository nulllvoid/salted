const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// iOS 27 / Xcode 27 requires UIScene lifecycle adoption or the app crashes
// on launch with EXC_BREAKPOINT ("UIScene life cycle is required for apps
// built with this SDK"). Expo SDK 57 / RN 0.86 don't generate scene support
// yet (expo/expo#46664, #50179), so this plugin patches the generated
// AppDelegate.swift + Info.plist on every prebuild until upstream lands it.
const MARKER = "// salted-scene-delegate";

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    for context in connectionOptions.urlContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = appDelegate.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }
  // Forward through AppDelegate's overrides so ExpoAppDelegate subscribers
  // (expo-linking's initial URL / URL events) run before RCTLinkingManager.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

const WINDOW_RE = /^\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
const START_RN_RE = /^\s*factory\.startReactNative\(\r?\n[\s\S]*?launchOptions: launchOptions\)\r?\n/m;
const NEW_WINDOW_LINE = `    self.launchOptions = launchOptions
`;

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }

    for (const [re, what] of [
      [WINDOW_RE, "window creation"],
      [START_RN_RE, "startReactNative call"],
    ]) {
      if (!re.test(contents)) {
        throw new Error(`with-ios-scene-delegate: AppDelegate.swift missing ${what}`);
      }
    }

    contents = contents.replace(WINDOW_RE, NEW_WINDOW_LINE).replace(START_RN_RE, "");

    const anchor = "  var window: UIWindow?\n";
    if (!contents.includes(anchor)) {
      throw new Error("with-ios-scene-delegate: missing AppDelegate window property");
    }

    contents = contents.replace(
      anchor,
      anchor + "  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n"
    );

    cfg.modResults.contents = contents + SCENE_DELEGATE;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withSceneManifest(withSceneAppDelegate(config));
