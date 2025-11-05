// Copied from ApplicationInsights-JS Offline Channel
// https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/PayloadHelper.ts

import { IDiagnosticLogger } from '@microsoft/applicationinsights-core-js';
import { IStorageTelemetryItem } from "@microsoft/applicationinsights-offlinechannel-js";

const _base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export function base64Encode(data: string | Uint8Array) {
    let line = "";
    let input = "";

    if (typeof data === "string") {
        input = data;
    } else {
        input = data.toString();
    }

    let output = "";
    // tslint:disable-next-line:one-variable-per-declaration
    let chr1: any, chr2: any, chr3: any;

    let lp = 0;
    while (lp < input.length) {
        chr1 = input.charCodeAt(lp++);
        chr2 = input.charCodeAt(lp++);
        chr3 = input.charCodeAt(lp++);

        // encode 4 character group
        line += _base64.charAt(chr1 >> 2);
        line += _base64.charAt(((chr1 & 3) << 4) | (chr2 >> 4));
        if (isNaN(chr2)) {
            line += "==";
        } else {
            line += _base64.charAt(((chr2 & 15) << 2) | (chr3 >> 6));
            line += isNaN(chr3) ? "=" : _base64.charAt(chr3 & 63);
        }
    }

    output += line;

    return output;
}

export function base64Decode(input: string): Uint8Array {
    try {
        // Prefer Buffer when available (node/react-native with Buffer polyfill)
        if (typeof (global as any).Buffer !== 'undefined' && (global as any).Buffer.from) {
            const buf = (global as any).Buffer.from(input, 'base64');
            return new Uint8Array(buf);
        }

        // Fallback to atob if available
        if (typeof (global as any).atob === 'function') {
            const binary = (global as any).atob(input);
            const arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                arr[i] = binary.charCodeAt(i);
            }
            return arr;
        }
    } catch (e) {
        // ignore and fall through
    }
    return new Uint8Array(0);
}

export class PayloadHelper {
    constructor(private _logger?: IDiagnosticLogger) {
        // noop
    }

    public base64ToArr(input: IStorageTelemetryItem): IStorageTelemetryItem {
        if (!input || !input.isArr) {
            return input;
        }
        try {
            const data = input.data as any;
            if (typeof data === 'string') {
                input.data = base64Decode(data) as any;
            }
            return input;
        } catch (e) {
            try { this._logger?.warnToConsole && this._logger.warnToConsole('base64ToArr failed: ' + (e && (e as any).message)); } catch { }
            return input;
        }
    }

    public base64ToStr(item: IStorageTelemetryItem): IStorageTelemetryItem {
        if (!item || !item.isArr) {
            return item;
        }
        try {
            const data = item.data;
            if (data) {
                item.data = base64Encode(data as any) as any;
            }
            return item;
        } catch (e) {
            try { this._logger?.warnToConsole && this._logger.warnToConsole('base64ToStr failed: ' + (e && (e as any).message)); } catch { }
            return item;
        }
    }
}
