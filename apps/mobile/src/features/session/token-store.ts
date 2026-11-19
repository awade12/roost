import * as SecureStore from "expo-secure-store";

const KEY = "roost.session";

/** The session token lives in the iOS Keychain / Android Keystore, never in plain storage. */
export const tokenStore = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
