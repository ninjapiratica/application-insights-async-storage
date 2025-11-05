// AsyncStorage-backed Offline Provider
// Converted for React Native (RN-only) from merged repository file.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IOfflineProvider,
  ILocalStorageProviderContext,
  IStorageTelemetryItem,
} from "@microsoft/applicationinsights-offlinechannel-js";
import {
  IProcessTelemetryContext,
  IDiagnosticLogger,
  getJSON,
  onConfigChange,
  IUnloadHookContainer,
  eBatchDiscardedReason,
  INotificationManager
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

// Default constants
const DefaultStorageKey = 'AIOffline';
const DefaultMaxStorageSizeInBytes = 5000000; // 5MB
const DefaultMaxInStorageTime = 7 * 24 * 60 * 60 * 1000; // 7 days
const EventsToDropAtOneTime = 10;
const Version = "1";
const MaxCriticalEvtsDropCnt = 2;

interface IJsonStoreDetails {
  key: string;
  db: IStorageJSON | null;
}

function _dropMaxTimeEvents(
  maxStorageTime: number,
  events: { [id: string]: IStorageTelemetryItem },
  eventsToDropAtOneTime: number,
  mgr?: INotificationManager
): boolean {
  let dropKeys: string[] = [];
  let droppedEvents = 0;
  const currentTime = Date.now() + 1;
  const minStartTime = currentTime - maxStorageTime;
  try {
    for (const key of Object.keys(events)) {
      const id = getTimeFromId(key);
      if (id <= minStartTime) {
        dropKeys.push(key);
        droppedEvents++;
      }
      if (droppedEvents >= eventsToDropAtOneTime) {
        break;
      }
    }

    if (droppedEvents > 0) {
      for (const k of dropKeys) {
        delete events[k];
      }

      if (mgr) {
        batchDropNotification(mgr, droppedEvents, eBatchDiscardedReason.MaxInStorageTimeExceeded);
      }
      return true;
    }
  } catch (e) {
    // ignore
  }

  return droppedEvents > 0;
}

// --- Implementation ---
export class AsyncStorageOfflineProvider implements IOfflineProvider {
  public id: string = 'AsyncStorageProvider';
  private _storageKeyPrefix: string;
  private _endpoint?: string;
  private _eventDropPerTime: number;
  private _maxCriticalCnt: number;
  private _storageKey: string;
  private _maxStorageSizeInBytes: number;
  private _inStorageMaxTime: number;
  private _logger?: IDiagnosticLogger;
  private _notificationManager?: any;
  private _configWatcher?: { rm?: () => void } | null;
  private _payloadHelper?: PayloadHelper | null;
  private _unloadHookContainer?: { add?: (h: any) => void } | null;

  constructor(id?: string, unloadHookContainer?: IUnloadHookContainer) {
    this.id = id || 'AsyncStorageProvider';
    this._storageKeyPrefix = DefaultStorageKey;
    this._storageKey = DefaultStorageKey;
    this._maxStorageSizeInBytes = DefaultMaxStorageSizeInBytes;
    this._inStorageMaxTime = DefaultMaxInStorageTime;
    this._eventDropPerTime = EventsToDropAtOneTime;
    this._maxCriticalCnt = MaxCriticalEvtsDropCnt;
    this._endpoint = undefined;
    this._payloadHelper = null;
    this._unloadHookContainer = unloadHookContainer || null;
    // expose debug plugin targets similar to original provider
    try {
      (this as any)["_getDbgPlgTargets"] = () => {
        return [this._storageKey, this._maxStorageSizeInBytes, this._inStorageMaxTime];
      };
    } catch (e) {
      // ignore
    }
  }

  // Fetch stored DB from AsyncStorage
  private async _fetchStoredDb(dbKey: string, returnDefault = true): Promise<IJsonStoreDetails> {
    let dbToStore: { lastAccessTime?: number; evts?: { [id: string]: IStorageTelemetryItem } } | null = null;
    try {
      const previousDb = await AsyncStorage.getItem(dbKey);
      if (previousDb) {
        try {
          dbToStore = getJSON()?.parse(previousDb);
        } catch (e) {
          // storage corrupted, remove it
          try { await AsyncStorage.removeItem(dbKey); } catch { }
          dbToStore = null;
        }
      }

      if (returnDefault && !dbToStore) {
        dbToStore = { evts: {}, lastAccessTime: 0 };
      }
    } catch (e) {
      // on error return default if requested
      if (returnDefault) {
        dbToStore = { evts: {}, lastAccessTime: 0 };
      }
    }

    return { key: dbKey, db: dbToStore };
  }

  // Clear and remove the DB from AsyncStorage, returning removed events
  private async _clearDatabase(dbKey: string): Promise<IStorageTelemetryItem[]> {
    const removedItems: IStorageTelemetryItem[] = [];
    const storeDetails = await this._fetchStoredDb(dbKey, false);
    const currentDb = storeDetails.db;
    if (currentDb) {
      const events = currentDb.evts || {};
      try {
        for (const k of Object.keys(events)) {
          const evt = events[k];
          if (evt) {
            removedItems.push(evt);
          }
        }
      } catch (e) {
        // ignore
      }

      await AsyncStorage.removeItem(storeDetails.key);
    }

    return removedItems;
  }

  public initialize(providerContext: ILocalStorageProviderContext, endpointUrl?: string): boolean {
    const storageConfig = providerContext.storageConfig;
    const itemCtx = providerContext.itemCtx;
    this._logger = this._logger || itemCtx?.diagLog?.();
    this._payloadHelper = new PayloadHelper(itemCtx?.diagLog?.());
    this._endpoint = getEndpointDomain(endpointUrl || providerContext.endpoint || "");
    const autoClean = !!storageConfig.autoClean;
    this._notificationManager = providerContext.notificationMgr;

    const unloadHook = onConfigChange(storageConfig, () => {
      this._maxStorageSizeInBytes = storageConfig.maxStorageSizeInBytes || DefaultMaxStorageSizeInBytes; // value checks and defaults should be applied during core config
      this._inStorageMaxTime = storageConfig.inStorageMaxTime || DefaultMaxInStorageTime; // TODO: handle 0
      const dropNum = storageConfig.EventsToDropPerTime as number;
      this._eventDropPerTime = (typeof dropNum !== 'undefined' && dropNum !== null) ? dropNum : EventsToDropAtOneTime;
      this._maxCriticalCnt = storageConfig.maxCriticalEvtsDropCnt || MaxCriticalEvtsDropCnt;
    }, this._logger);

    this._unloadHookContainer?.add && this._unloadHookContainer.add(unloadHook);

    // currently, won't handle endpoint change here
    // new endpoint will open a new db
    // endpoint change will be handled at offline batch level
    // namePrefix should not contain any "_"
    this._storageKeyPrefix = storageConfig.storageKeyPrefix || DefaultStorageKey;
    this._storageKey = this._storageKeyPrefix + "_" + Version + "_" + this._endpoint;

    if (autoClean) {
      // won't wait response here
      this.clean();
    }

    return true;
  }

  public supportsSyncRequests(): boolean {
    return false; // AsyncStorage is async
  }

  public async getAllEvents(cnt?: number): Promise<IStorageTelemetryItem[]> {
    return this.getEvents(cnt);
  }

  public async getNextBatch(): Promise<IStorageTelemetryItem[]> {
    return this.getEvents(1, true);
  }

  public async addEvent(key: string, evt: IStorageTelemetryItem, itemCtx?: IProcessTelemetryContext): Promise<IStorageTelemetryItem> {
    evt.id = evt.id || key || getTimeId();
    evt.criticalCnt = evt.criticalCnt || 0;
    let id = evt.id;
    if (evt.isArr) {
      evt = this._payloadHelper?.base64ToStr(evt) || evt;
    }
    let preDroppedCnt = 0;

    // read current stored map
    const theStore = await this._fetchStoredDb(this._storageKey, true);
    const parsed = theStore.db?.evts || {};
    const events = parsed;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // insert event
      events[id] = evt;

      const theStore = { key: this._storageKey, db: parsed };
      if (await this._updateStoredDb(theStore)) {
        // Database successfully updated
        if (preDroppedCnt && this._notificationManager) {
          batchDropNotification(this._notificationManager, preDroppedCnt, eBatchDiscardedReason.CleanStorage);
        }
        return evt;
      }
      // treat as write failure and fall through to drop logic
      delete events[id];
      const droppedCnt = _dropEventsUpToPersistence(this._maxCriticalCnt, events, this._eventDropPerTime);
      preDroppedCnt += droppedCnt;
      if (!droppedCnt) {
        // Can't free any space for event
        return Promise.reject(new Error('Unable to free up event space'));
      }
    }
  }

  public async removeEvents(evts: IStorageTelemetryItem[]): Promise<IStorageTelemetryItem[]> {
    const store = await this._fetchStoredDb(this._storageKey, false);
    if (!store.db) return evts;

    let events = store.db.evts || {};
    try {
      for (let i = 0; i < evts.length; ++i) {
        let evt = evts[i];
        delete events[evt.id as string];
      }

      // Update takes care of removing the DB if it's completely empty now
      if (await this._updateStoredDb(store)) {
        return evts;
      }
    } catch (e) {
      // Storage corrupted
    }

    // failure here so try and remove db to unblock following events
    evts = await this._clearDatabase(store.key);

    return evts;
  }

  public async clear(): Promise<IStorageTelemetryItem[]> {
    try {
      const store = await this._fetchStoredDb(this._storageKey, false);
      if (!store.db) return [];
      const parsed = store.db.evts || {};
      const all = Object.keys(parsed).map(k => parsed[k]);
      store.db = {};
      this._updateStoredDb(store);
      return all;
    } catch (e) {
      return [];
    }
  }

  public async clean(): Promise<boolean> {
    try {
      const store = await this._fetchStoredDb(this._storageKey, false);
      if (!store.db) return true;
      const parsed = store.db.evts || {};
      const isDropped = _dropMaxTimeEvents(this._inStorageMaxTime, parsed, this._eventDropPerTime);
      if (isDropped) {
        store.db.evts = parsed;
        return await this._updateStoredDb(store);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  public async teardown(): Promise<void> {
    try {
      let theStore = await this._fetchStoredDb(this._storageKey, false);
      let storedDb = theStore.db;
      if (storedDb) {
        // reset the last access time
        storedDb.lastAccessTime = 0;
        this._updateStoredDb(theStore, false);
      }
      // remove config watcher if registered
      try {
        if (this._configWatcher && this._configWatcher.rm) {
          this._configWatcher.rm();
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // Add diagnostic logging
    }
  }

  // Read and return events from storage (optionally limited by cnt)
  private async getEvents(cnt?: number, ordered?: boolean): Promise<IStorageTelemetryItem[]> {
    const store = await this._fetchStoredDb(this._storageKey, false);
    if (!store.db) return [];
    const parsed = store.db.evts || {};
    // Build entries with derived time to allow stable sorting even for legacy items
    const entries = Object.keys(parsed).map(k => ({ id: k, item: parsed[k], time: ((parsed[k] as any).time || getTimeFromId(k)) }));
    if (ordered) {
      entries.sort((a, b) => a.time - b.time);
    }
    const arr = entries.map(e => e.item);
    return typeof cnt === 'number' ? arr.slice(0, cnt) : arr;
  }

  // Persist a JSON store (with a db object) to AsyncStorage.
  // Returns true when the store was successfully written and within size limits.
  private async _updateStoredDb(jsonStore: { key: string; db: IStorageJSON | null }, updateLastAccessTime = true): Promise<boolean> {
    const dbToStore = jsonStore.db;
    if (dbToStore) {
      if (updateLastAccessTime) {
        dbToStore.lastAccessTime = Date.now();
      }
    }

    try {
      const jsonString = JSON.stringify(dbToStore);
      if (jsonString.length > this._maxStorageSizeInBytes) {
        // We can't store the database as it would exceed the configured max size
        return false;
      }

      await AsyncStorage.setItem(jsonStore.key, jsonString);
    } catch (e) {
      // Could not store the database
      return false;
    }

    return true;
  }

  // Convert a stored item with binary data into a string form (per original comment).
  // If item.isArr is false or the conversion fails, return the original item.
  // payload conversion is handled by PayloadHelper


}

function _dropEventsUpToPersistence(
  maxCnt: number,
  events: { [id: string]: IStorageTelemetryItem },
  eventsToDropAtOneTime: number
): number {
  let dropKeys: string[] = [];
  let persistenceCnt = 0;
  let droppedEvents = 0;
  while (persistenceCnt <= maxCnt && droppedEvents < eventsToDropAtOneTime) {
    for (const key of Object.keys(events)) {
      const evt = events[key];
      if ((evt as any).criticalCnt === persistenceCnt) {
        dropKeys.push(key);
        droppedEvents++;
      }
      if (droppedEvents >= eventsToDropAtOneTime) break;
    }
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
