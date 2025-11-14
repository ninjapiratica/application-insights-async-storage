# np-application-insights-async-storage

## **BETA**

## Overview

This package is a small drop-in replacement for the built-in WebStorageProvider used by the Application Insights offline channel, but implemented on top of @react-native-async-storage/async-storage so it works in React Native environments where `localStorage` / `sessionStorage` are not available.

It mirrors the WebStorageProvider API and semantics from:
https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Providers/WebStorageProvider.ts#L221

## Install

This package declares the following peer dependencies in `package.json` (consumers must install these in their app):

- `@microsoft/applicationinsights-offlinechannel-js` ^0.3.10
- `@react-native-async-storage/async-storage` ^2.0.0

Using npm (install the library and the required peers):
```bash
npm install np-application-insights-async-storage
npm install @react-native-async-storage/async-storage@^2.0.0
npm install @microsoft/applicationinsights-offlinechannel-js@^0.3.10
```

Using yarn:
```bash
yarn add np-application-insights-async-storage
yarn add @react-native-async-storage/async-storage@^2.0.0
yarn add @microsoft/applicationinsights-offlinechannel-js@^0.3.10
```

## Usage

Follow the usage setup by `@microsoft/applicationinsights-offlinechannel-js`. Set the customProvider to AsyncStorageProvider. If you are in an environment where localstorage is unavailable, set the customUnloadProvider as well.

Example:
```diff
import { OfflineChannel } from '@microsoft/applicationinsights-offlinechannel-js';
import AsyncStorageProvider from '@np/application-insights-async-storage';

// create provider (constructor accepts the same options shape as WebStorageProvider)
const storageProvider = new AsyncStorageProvider();

// wire it into your offline channel / configuration in place of WebStorageProvider
const offlineChannel = new OfflineChannel();
const appInsights = new ApplicationInsights({
  config: {
    connectionString: '',
    extensionsConfig: {
      [offlineChannel.identifier]: {
        minPersistenceLevel: 0,
+        customProvider: new AsyncStorageProvider(),
+        customUnloadProvider: new AsyncStorageUnloadProvider()
      }
    }
  }
})
appInsights.loadAppInsights();
appInsights.addPlugin(offlineChannel);
```

## Notes and recommendations