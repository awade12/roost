import { LogBox } from "react-native";

// NativeWind 4's runtime registers styles on every core component, ImageBackground included, which
// React Native 0.88 deprecates. We don't use it; drop this once NativeWind stops touching it.
// Loaded from index.ts before anything else, because the warning fires while modules load.
LogBox.ignoreLogs(["ImageBackground is deprecated"]);
