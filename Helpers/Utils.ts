// Copied from https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Helpers/Utils.ts
// The exported items from this file are not exported publicly from the offline-channel-js library, so they are copied here.
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// "@nevware21/ts-utils"
export const strSubstr = (value: string, start: number, length?: number): string =>
    value.substring(start, length === undefined ? undefined : start + length);

// "@microsoft/applicationinsights-core-js"
export const random32 = (signed?: boolean) => {
    const UInt32Mask = 0x100000000;
    // Make sure the number is converted into the specified range (-0x80000000..0x7FFFFFFF)
    let value = Math.floor((UInt32Mask * Math.random()) | 0);

    if (!signed) {
        // Make sure we end up with a positive number and not -ve one.
        value >>>= 0;
    }

    return value;
}

export const generateW3CId = () => {

    const hexValues = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];

    // rfc4122 version 4 UUID without dashes and with lowercase letters
    let oct = "", tmp;
    for (let a = 0; a < 4; a++) {
        tmp = random32();
        oct +=
            hexValues[tmp & 0xF] +
            hexValues[tmp >> 4 & 0xF] +
            hexValues[tmp >> 8 & 0xF] +
            hexValues[tmp >> 12 & 0xF] +
            hexValues[tmp >> 16 & 0xF] +
            hexValues[tmp >> 20 & 0xF] +
            hexValues[tmp >> 24 & 0xF] +
            hexValues[tmp >> 28 & 0xF];
    }

    // "Set the two most significant bits (bits 6 and 7) of the clock_seq_hi_and_reserved to zero and one, respectively"
    const clockSequenceHi = hexValues[8 + (random32() & 0x03) | 0];
    return strSubstr(oct, 0, 8) + strSubstr(oct, 9, 4) + "4" + strSubstr(oct, 13, 3) + clockSequenceHi + strSubstr(oct, 16, 3) + strSubstr(oct, 19, 12);
}

/**
 * Get domian from an endpoint url.
 * for example, https://test.com?auth=true, will return test.com
 * @param endpoint - endpoint url
 * @returns domain string
 */
export function getEndpointDomain(endpoint: string) {
    try {
        let url = endpoint.replace(/^https?:\/\/|^www\./, "");
        url = url.replace(/\?/, "/");
        let arr = url.split("/");
        if (arr && arr.length > 0) {
            return arr[0];
        }

    } catch (e) {
        // eslint-disable-next-line no-empty
    }
    // if we can't get domain, entire endpoint will be used
    return endpoint;
}

//Base64 is a binary encoding rather than a text encoding,
// it were added to the web platform before it supported binary data types.
// As a result, the two functions use strings to represent binary data
const _base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
/**
 * Base64-encodes a Uint8Array.
 *
 * @param data - the Uint8Array or string to encode.
 *
 * @returns the base64-encoded output string.
 */
export function base64Encode(data: string | Uint8Array) {
    let line = "";
    let input = "";

    input = data.toString();

    let output = "";
    // tslint:disable-next-line:one-variable-per-declaration
    let chr1, chr2, chr3;

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

/**
 * Base64-decodes an encoded string and transforms it back to a Uint8Array.
 * @param input - the encoded string to decode
 * @returns  Uint8Array
 */
export function base64Decode(input: string) {
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    while (i < input.length) {

        enc1 = _base64.indexOf(input.charAt(i++));
        enc2 = _base64.indexOf(input.charAt(i++));
        enc3 = _base64.indexOf(input.charAt(i++));
        enc4 = _base64.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        output = output + String.fromCharCode(chr1);

        if (enc3 != 64) {
            output = output + String.fromCharCode(chr2);
        }
        if (enc4 != 64) {
            output = output + String.fromCharCode(chr3);
        }

    }
    let arr = output.split(",").map(c => Number(c));
    return new Uint8Array(arr);

}

/**
 * Get number value of current time and append a random float number.
 * For example, if current time value is 12345678, so "12345678.randomfl" will be returned
 * @returns time id string
 */
export function getTimeId(): string {
    let time = (new Date()).getTime();
    // append random digits to avoid same timestamp value
    const random = strSubstr(generateW3CId(), 0, 8);
    // function to create spanid();
    return time + "." + random;
}

/**
 * Get time value from a time id that is generated from getTimeId() function.
 * For example, if time id is "12345678.randomfl", 12345678 will be returned
 * @param id - time id string
 * @returns time value number
 */
export function getTimeFromId(id: string) {
    try {
        let regex = new RegExp(/\d+\./g);
        if (id && regex.test(id.toString())) {
            let arr = id.split(".");
            return parseInt(arr[0]);

        }
    } catch (e) {
        // eslint-disable-next-line no-empty
    }
    return 0;
}

export function forEachMap<T>(map: { [key: string]: T }, callback: (value: T, key: string) => boolean, ordered?: boolean): void {
    if (map) {
        let keys = Object.keys(map);
        if (!!ordered && keys) {
            let time = (new Date()).getTime();
            keys = keys.sort((a, b) => {
                try {
                    // if getTimeFromId returns 0, mean the time is not valid
                    let aTime = getTimeFromId(a) || time;
                    let bTime = getTimeFromId(b) || time;
                    return aTime - bTime;
                } catch (e) {
                    // eslint-disable-next-line no-empty
                }
                return -1;
            });
        }
        for (let lp = 0; lp < keys.length; lp++) {
            let key = keys[lp];
            if (!callback(map[key], key)) {
                break;
            }
        }
    }
}