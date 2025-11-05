// Copied from https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/PayloadHelper.ts
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
    IDiagnosticLogger, _eInternalMessageId, _throwInternal, eLoggingSeverity, isFunction
} from "@microsoft/applicationinsights-core-js";
import { base64Decode, base64Encode } from "./Helpers/Utils";
import { IStorageTelemetryItem } from "@microsoft/applicationinsights-offlinechannel-js";

export class PayloadHelper {
    private _logger: IDiagnosticLogger;

    constructor(logger: IDiagnosticLogger) {
        // keep logger for internal diagnostics
        this._logger = logger;
    }

    /**
     *  Decode the JSON string back to Uint8 array.
     */
    public base64ToArr(input: IStorageTelemetryItem): IStorageTelemetryItem | null {
        if (!input || !input.isArr) {
            return input;
        }

        try {
            let data = input.data;
            if (data) {
                input.data = base64Decode(data as any);
            }
            return input;
        } catch (e) {
            // if serialization fails return an empty string
            _throwInternal(this._logger, eLoggingSeverity.CRITICAL, _eInternalMessageId.CannotSerializeObject, (e && isFunction(e.toString)) ? e.toString() : "Error serializing object", undefined, true);
        }
        return null;
    }

    /**
     * Code the Uint8 array object to string.
     */
    public base64ToStr(item: IStorageTelemetryItem): IStorageTelemetryItem | null {
        if (!item || !item.isArr) {
            return item;
        }

        try {
            let data = item.data;
            if (data) {
                item.data = base64Encode(data as any);
            }
            return item;
        } catch (e) {
            // if serialization fails return an empty string
            _throwInternal(this._logger, eLoggingSeverity.CRITICAL, _eInternalMessageId.CannotSerializeObject, (e && isFunction(e.toString)) ? e.toString() : "Error serializing object", undefined, true);
        }
        return null;
    }
}