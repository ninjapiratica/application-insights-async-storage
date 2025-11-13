// Copied from https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Interfaces/IOfflineProvider.ts
// The exported items from this file are not exported publicly from the offline-channel-js library, so they are copied here.
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    IStorageTelemetryItem,
} from "@microsoft/applicationinsights-offlinechannel-js";

/**
 * An internal interface which defines web provider Storage JSON details
 */
export interface IStorageJSON {

    /**
     * The timestamp at which the storage was last accessed.
     */
    lastAccessTime?: number;
    evts?: { [id: string]: IStorageTelemetryItem }; // id is the timestamp value
}