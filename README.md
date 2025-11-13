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

Notes:
- Because this is a library, we declare these packages as peer dependencies so the host application controls the exact installed versions and avoids duplicate copies of shared frameworks.
- If your project already provides either package, you don't need to re-install it.

## Usage

Because the provider implements the same interface as the upstream WebStorageProvider, you can use it anywhere a WebStorageProvider is expected. Replace `new WebStorageProvider(...)` with `new AsyncStorageProvider(...)` when configuring the offline channel.

Example (conceptual):
```javascript
import { OfflineChannel } from '@microsoft/applicationinsights-offlinechannel-js';
import AsyncStorageProvider from '@np/application-insights-async-storage';

// create provider (constructor accepts the same options shape as WebStorageProvider)
const storageProvider = new AsyncStorageProvider({ /* optional options, e.g. key */ });

// wire it into your offline channel / configuration in place of WebStorageProvider
const offlineChannel = new OfflineChannel();
// wherever your integration expects a storage provider, supply `storageProvider`.
// (This library implements the same storage provider API as WebStorageProvider.)
offlineChannel.storageProvider = storageProvider;
```

If you previously configured Application Insights or the offline channel with WebStorageProvider, the swap is typically a one-line change.

## Notes and recommendations

- Test against the versions you support. This package lists the following versions in package.json:
  - peer: `@microsoft/applicationinsights-offlinechannel-js` (see package.json)
  - peer: `@react-native-async-storage/async-storage` (install in the host app)
- Document in your app’s README that AsyncStorage must be installed and linked (React Native autolinking usually covers this).
- Because this package is a library, consumers control exact versions of AsyncStorage and Application Insights; ranges are used for peer dependencies.

If you want a short example tailored to your app’s initialization code, attach the code you use to configure Application Insights and I can show the exact replacement.