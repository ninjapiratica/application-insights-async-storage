// Copied from https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Providers/WebStorageProvider.ts
// AsyncStorage-backed Offline Provider
// Converted for React Native (RN-only) from merged repository file.

import AsyncStorage, { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import {
  IOfflineProvider,
  ILocalStorageProviderContext,
  IStorageTelemetryItem,
} from "@microsoft/applicationinsights-offlinechannel-js";
import {
  IProcessTelemetryContext,
  getJSON,
  onConfigChange,
  IUnloadHookContainer,
  eBatchDiscardedReason,
  INotificationManager,
  isNotNullOrUndefined
} from '@microsoft/applicationinsights-core-js';
import {
  getTimeId,
  getTimeFromId,
  getEndpointDomain,
  batchDropNotification
} from './Helpers/Utils';
import {
  IStorageJSON
} from './Interfaces/IOfflineProvider';
import {
  PayloadHelper
} from './PayloadHelper';

interface IJsonStoreDetails {
  key: string;
  db: IStorageJSON;
}

// Constants (originally present in the protostub/merged source)
const EventsToDropAtOneTime = 10;
const Version = "1";
const DefaultStorageKey = "AIOffline";
const DefaultMaxStorageSizeInBytes = 5000000;
const MaxCriticalEvtsDropCnt = 2;
const DefaultMaxInStorageTime = 604800000; //7*24*60*60*1000 7days


function createAsyncRejectedPromise(e: any): any {
  return Promise.reject(e) as any;
}

function forEachMap<T>(map: { [key: string]: T }, callback: (value: T, key: string) => boolean, ordered?: boolean): void {
  if (map) {
    let keys = Object.keys(map || {});
    if (!!ordered && keys) {
      let time = (new Date()).getTime();
      keys = keys.sort((a, b) => {
        try {
          let aTime = getTimeFromId(a) || time;
          let bTime = getTimeFromId(b) || time;
          return aTime - bTime;
        } catch (e) {
          // ignore
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

// Private helper methods that are not exposed as class methods
function _isQuotaExceeded(storage: Storage | null, e: any) {
  let result = false;
  if (e instanceof DOMException) {
    // test name field too, because code might not be present
    if (e.code === 22 || e.name === "QuotaExceededError" ||            // everything except Firefox
      e.code === 1014 || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {   // Firefox
      if (storage && storage.length !== 0) {
        // acknowledge QuotaExceededError only if there's something already stored
        result = true;
      }
    }
  }

  return result;
}

/**
* Check and return that the storage type exists and has space to use
*/
function _getAvailableStorage(): AsyncStorageStatic {
  return AsyncStorage;
}


// will drop batches with no critical evts first
function _dropEventsUpToPersistence(
  maxCnt: number,
  events: { [id: string]: IStorageTelemetryItem },
  eventsToDropAtOneTime: number): number {
  let dropKeys: string[] = [];
  let persistenceCnt = 0;
  let droppedEvents = 0;
  while (persistenceCnt <= maxCnt && droppedEvents < eventsToDropAtOneTime) {
    forEachMap<IStorageTelemetryItem>(events || {}, (evt, key) => {
      if ((evt as any).criticalCnt === persistenceCnt) {
        dropKeys.push(key);
        droppedEvents++;
      }
      return (droppedEvents < eventsToDropAtOneTime);
    });
    if (droppedEvents > 0) {
      for (let lp = 0; lp < dropKeys.length; lp++) {
        delete events[dropKeys[lp]];
      }
      return droppedEvents;
    }

    persistenceCnt++;
  }

  return droppedEvents;
}

function _dropMaxTimeEvents(
  maxStorageTime: number | null,
  events: { [id: string]: IStorageTelemetryItem },
  eventsToDropAtOneTime: number | null,
  mgr?: INotificationManager): boolean {
  let dropKeys: string[] = [];
  let droppedEvents = 0;
  let currentTime = (new Date()).getTime() + 1; // handle appended random float number
  let minStartTime = (currentTime - (maxStorageTime || DefaultMaxInStorageTime));
  try {
    forEachMap<IStorageTelemetryItem>(events || {}, (evt, key) => {
      let id = getTimeFromId(key);
      if (id <= minStartTime) {
        dropKeys.push(key);
        droppedEvents++;
      }
      return (droppedEvents < (eventsToDropAtOneTime || EventsToDropAtOneTime));
    });

    if (droppedEvents > 0) {
      for (let lp = 0; lp < dropKeys.length; lp++) {
        delete events[dropKeys[lp]];
      }
      if (mgr) {
        batchDropNotification(mgr, droppedEvents, eBatchDiscardedReason.MaxInStorageTimeExceeded);
      }

      return true;
    }

  } catch (e) {
    // catch drop events error
  }

  return droppedEvents > 0;
}

/**
 * Class that implements storing of events using the WebStorage Api ((window||globalThis||self).localstorage, (window||globalThis||self).sessionStorage).
 */
export class WebStorageProvider implements IOfflineProvider {
  public id: string | undefined;

  // internal fields converted from dynamicProto closure (use looser types)
  private _storage: AsyncStorageStatic = AsyncStorage;
  private _storageKeyPrefix: any = DefaultStorageKey;
  private _maxStorageSizeInBytes: any = DefaultMaxStorageSizeInBytes;
  private _payloadHelper: any = null;
  private _storageKey: any = null;
  private _endpoint: any = null;
  private _maxStorageTime: any = null;
  private _eventDropPerTime: any = null;
  private _maxCriticalCnt: any = null;
  private _notificationManager: any = null;
  private _unloadHookContainer?: IUnloadHookContainer;

  constructor(id?: string, unloadHookContainer?: IUnloadHookContainer) {
    this.id = id;
    this._unloadHookContainer = unloadHookContainer;

    // expose debugging helper for parity with previous implementation
    (this as any)["_getDbgPlgTargets"] = () => {
      return [this._storageKey, this._maxStorageSizeInBytes, this._maxStorageTime];
    };
  }

  /**
   * Initializes the provider using the config
   * @param providerContext - The provider context that should be used to initialize the provider
   * @returns True if the provider is initialized and available for use otherwise false
   */
  public initialize(providerContext: ILocalStorageProviderContext, endpointUrl?: string): boolean {
    if (!this._storage) {
      return false;
    }

    // use any to avoid missing type imports
    let storageConfig: any = (providerContext as any).storageConfig;
    let itemCtx: any = (providerContext as any).itemCtx;
    this._payloadHelper = new PayloadHelper(itemCtx.diagLog());
    this._endpoint = getEndpointDomain(endpointUrl || (providerContext as any).endpoint);
    let autoClean = !!storageConfig.autoClean;
    this._notificationManager = (providerContext as any).notificationMgr || null;

    let unloadHook = onConfigChange(storageConfig, () => {
      this._maxStorageSizeInBytes = storageConfig.maxStorageSizeInBytes || DefaultMaxStorageSizeInBytes; // value checks and defaults should be applied during core config
      this._maxStorageTime = storageConfig.inStorageMaxTime || DefaultMaxInStorageTime; // TODO: handle 0
      let dropNum = storageConfig.EventsToDropPerTime;
      this._eventDropPerTime = isNotNullOrUndefined(dropNum) ? dropNum : EventsToDropAtOneTime;
      this._maxCriticalCnt = storageConfig.maxCriticalEvtsDropCnt || MaxCriticalEvtsDropCnt;
    });
    this._unloadHookContainer && this._unloadHookContainer.add(unloadHook);

    // currently, won't handle endpoint change here
    // new endpoint will open a new db
    // endpoint change will be handled at offline batch level
    // namePrefix should not contain any "_"
    this._storageKeyPrefix = storageConfig.storageKeyPrefix || DefaultStorageKey;
    this._storageKey = this._storageKeyPrefix + "_" + Version + "_" + (this._endpoint || "");

    if (autoClean) {
      // won't wait response here
      this.clean();
    }

    return true;
  }

  /**
    * Identifies whether this storage provider support synchronous requests
   */
  public supportsSyncRequests(): boolean {
    return false;
  }

  /**
   * Get all of the currently cached events from the storage mechanism
   */
  public async getAllEvents(cnt?: number): Promise<IStorageTelemetryItem[]> {
    try {
      return await this._getEvts(cnt);
    } catch (e) {
      return createAsyncRejectedPromise(e);
    }
  }

  /**
   * Get Next cached event from the storage mechanism
   */
  public async getNextBatch(): Promise<IStorageTelemetryItem[]> {
    try {
      // set ordered to true, to make sure to get earliest events first
      return await this._getEvts(1, true);
    } catch (e) {
      return createAsyncRejectedPromise(e);
    }
  }

  private async _getEvts(cnt?: number, ordered?: boolean): Promise<IStorageTelemetryItem[]> {
    let allItems: IStorageTelemetryItem[] = [];
    let theStore = (await this._fetchStoredDb(this._storageKey || "")).db;
    if (theStore) {
      let events = theStore.evts || {};
      forEachMap(events, (evt, key) => {
        if (evt) {
          if ((evt as any).isArr) {
            evt = (this._payloadHelper as any).base64ToArr(evt);
          }
          allItems.push(evt);
        }
        if (cnt && allItems && allItems.length == cnt) {
          return false;
        }
        return true;
      }, ordered);
    }
    return allItems;
  }

  /**
   * Stores the value into the storage using the specified key.
   * @param key - The key value to use for the value
   * @param value - The actual value of the request
   */
  public async addEvent(key: string, evt: IStorageTelemetryItem, itemCtx: IProcessTelemetryContext): Promise<IStorageTelemetryItem> {
    try {
      let theStore = await this._fetchStoredDb(this._storageKey || "");
      evt.id = evt.id || getTimeId();
      evt.criticalCnt = evt.criticalCnt || 0;
      let events = (theStore.db && theStore.db.evts) || {};
      let id = evt.id;
      if (evt && (evt as any).isArr) {
        evt = (this._payloadHelper as any).base64ToStr(evt);
      }
      let preDroppedCnt = 0;

      // eslint-disable-next-line no-constant-condition
      while (true && evt) {
        events[id] = evt;
        if (await this._updateStoredDb(theStore)) {
          // Database successfully updated
          if (preDroppedCnt && this._notificationManager) {
            // only send notification when batches are updated successfully in storage
            batchDropNotification(this._notificationManager, preDroppedCnt, eBatchDiscardedReason.CleanStorage);
          }
          return evt;
        }

        // Could not not add events to storage assuming its full, so drop events to make space
        // or max size exceeded
        delete events[id];
        let droppedCnt = _dropEventsUpToPersistence(this._maxCriticalCnt || MaxCriticalEvtsDropCnt, events || {}, this._eventDropPerTime || EventsToDropAtOneTime);
        preDroppedCnt += droppedCnt;
        if (!droppedCnt) {
          // Can't free any space for event
          return createAsyncRejectedPromise(new Error("Unable to free up event space"));
        }
      }

      // This shouldn't be reached but TS is complaining
      return evt;
    } catch (e) {
      return createAsyncRejectedPromise(e);
    }
  }

  /**
   * Removes the value associated with the provided key
   * @param evts - The events to be removed
   */
  public async removeEvents(evts: IStorageTelemetryItem[]): Promise<IStorageTelemetryItem[]> {
    try {
      let theStore = await this._fetchStoredDb(this._storageKey || "", false);
      let currentDb = theStore.db;
      if (currentDb) {
        let events = currentDb.evts || {};
        try {
          for (let i = 0; i < evts.length; ++i) {
            let evt = evts[i];
            if (evt && (evt as any).id) {
              delete events[(evt as any).id];
            }
          }

          // Update takes care of removing the DB if it's completely empty now
          if (await this._updateStoredDb(theStore)) {
            return evts;
          }
        } catch (e) {
          // Storage corrupted
        }

        // failure here so try and remove db to unblock following events
        evts = await this._clearDatabase(theStore.key);
      }

      return evts;
    } catch (e) {
      return createAsyncRejectedPromise(e);
    }
  }

  /**
   * Removes all entries from the storage provider for the current endpoint and returns them as part of the response, if there are any.
   */
  public async clear(): Promise<IStorageTelemetryItem[]> {
    try {
      let removedItems: IStorageTelemetryItem[] = [];
      let theStore = await this._fetchStoredDb(this._storageKey || "", false);
      let storedDb = theStore.db;
      if (storedDb) {
        let events = storedDb.evts || {};
        forEachMap(events, (evt) => {
          if (evt) {
            if (evt && (evt as any).id) {
              delete events[(evt as any).id]
            }
            removedItems.push(evt);
          }

          return true;
        });

        await this._updateStoredDb(theStore);
      }

      return removedItems;
    } catch (e) {
      // Unable to clear the database
      return createAsyncRejectedPromise(e);
    }
  }

  // @ts-ignore - keep original interface but allow optional disable
  public async clean(disable?: boolean): Promise<boolean> {
    let storeDetails = await this._fetchStoredDb(this._storageKey || "", false);
    let currentDb = storeDetails.db;
    if (currentDb) {
      let events = currentDb.evts || {};
      try {
        let isDropped = _dropMaxTimeEvents(this._maxStorageTime, events, this._eventDropPerTime, this._notificationManager);
        if (isDropped) {
          return await this._updateStoredDb(storeDetails);
        }
        return true;
      } catch (e) {
        // should not throw errors here
        // because we don't want to block following process
      }
      return false;
    }
  }

  /**
   * Shuts-down the telemetry plugin. This is usually called when telemetry is shut down.
   * This attempts to update the lastAccessTime for any storedDb
   */
  public async teardown(): Promise<void> {
    try {
      let theStore = await this._fetchStoredDb(this._storageKey, false);
      let storedDb = theStore.db;
      if (storedDb) {
        // reset the last access time
        storedDb.lastAccessTime = 0;
        await this._updateStoredDb(theStore, false);
      }
    } catch (e) {
      // Add diagnostic logging
    }
  }

  /**
   * @ignore
   * Creates a new json store with the StorageJSON (may be null), a null db value indicates that the store
   * associated with the key is empty and should be removed.
   * @param dbKey - The key to associate with the database
   * @param db - The database
   */
  private _newStore(dbKey: string, db: IStorageJSON): IJsonStoreDetails {
    return {
      key: dbKey,
      db: db
    };
  }

  private async _fetchStoredDb(dbKey: string, returnDefault = true): Promise<IJsonStoreDetails> {
    dbKey = dbKey || "";
    let dbToStore: IStorageJSON | null = null;
    if (this._storage) {
      let previousDb = await this._storage.getItem(dbKey);

      if (previousDb) {
        try {
          dbToStore = (getJSON() as any).parse(previousDb as string);
        } catch (e) {
          // storage corrupted
          await this._storage.removeItem(dbKey);
        }
      }

      if (returnDefault && !dbToStore) {
        // Create and return a default empty database
        dbToStore = {
          evts: {},
          lastAccessTime: 0
        };
      }
    }

    return this._newStore(dbKey, dbToStore as any);
  }

  private async _updateStoredDb(jsonStore: IJsonStoreDetails, updateLastAccessTime = true): Promise<boolean> {
    //let removeDb = true;
    let dbToStore = jsonStore.db;
    if (dbToStore) {
      if (updateLastAccessTime) {
        // Update the last access time
        dbToStore.lastAccessTime = (new Date()).getTime();
      }
    }

    try {
      let jsonString = (getJSON() as any).stringify(dbToStore || {});
      if (jsonString.length > (this._maxStorageSizeInBytes || DefaultMaxStorageSizeInBytes)) {
        // We can't store the database as it would exceed the configured max size
        return false;
      }

      this._storage && await this._storage.setItem(jsonStore.key, jsonString);
    } catch (e) {
      // catch exception due to trying to store or clear JSON
      // We could not store the database
      return false;
    }

    return true;
  }

  private async _clearDatabase(dbKey: string): Promise<IStorageTelemetryItem[]> {
    let removedItems: IStorageTelemetryItem[] = [];
    let storeDetails = await this._fetchStoredDb(dbKey, false);
    let currentDb = storeDetails.db;
    if (currentDb) {
      let events = currentDb.evts || {};
      try {
        forEachMap(events, (evt) => {
          if (evt) {
            removedItems.push(evt);
          }

          return true;
        });
      } catch (e) {
        // catch exception due to trying to store or clear JSON
      }

      // Remove the entire stored database
      this._storage && await this._storage.removeItem(storeDetails.key);
    }

    return removedItems;
  }
}