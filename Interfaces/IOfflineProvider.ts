// Copied from ApplicationInsights-JS Offline Channel
// https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Interfaces/IOfflineProvider.ts

import {
    IStorageTelemetryItem
} from "@microsoft/applicationinsights-offlinechannel-js";

export interface IStorageJSON {
    lastAccessTime?: number;
    evts?: { [id: string]: IStorageTelemetryItem };
}
