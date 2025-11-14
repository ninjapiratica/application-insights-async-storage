// Copied from https://github.com/microsoft/ApplicationInsights-JS/blob/4835556ce61ba902e4da0b85e76d7f175a39ffea/channels/offline-channel-js/src/Providers/WebStorageProvider.ts
// AsyncStorage-backed Offline Provider
// Converted for React Native (RN-only) from merged repository file.

import AsyncStorage, { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import {
  IOfflineProvider,
  ILocalStorageProviderContext,
  IStorageTelemetryItem,
  IOfflineChannelConfiguration,
} from "@microsoft/applicationinsights-offlinechannel-js";
import {
  getTimeId,
  getTimeFromId,
  getEndpointDomain,
  forEachMap
} from './Helpers/Utils';
import {
  PayloadHelper
} from './PayloadHelper';

interface IJsonStoreDetails {
  key: string;
  db: {
    evts: { [id: string]: IStorageTelemetryItem }
  };
}

// @microsoft/applicationinsights-core-js
function isNotNullOrUndefined(value: any) {
  return !(value === null || value === undefined);
}
export const getJSON = () => JSON;

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
  eventsToDropAtOneTime: number | null): boolean {
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

      return true;
    }

  } catch (e) {
    // catch drop events error
  }

  return droppedEvents > 0;
}

export class AsyncStorageProvider implements IOfflineProvider {
  public id: string;

  // internal state from original implementation
  protected _storage = AsyncStorage;
  private _storageKeyPrefix: string = DefaultStorageKey;
  private _maxStorageSizeInBytes: number = DefaultMaxStorageSizeInBytes;
  private _payloadHelper: PayloadHelper | null = null;
  private _storageKey: string | null = null;
  private _endpoint: string | null = null;
  private _maxStorageTime: number | null = null;
  private _eventDropPerTime: number | null = null;
  private _maxCriticalCnt: number | null = null;

  constructor(id?: string) {
    this.id = id || "";
  }

  // debug helper copied from original closure
  public _getDbgPlgTargets(): any[] {
    return [this._storageKey, this._maxStorageSizeInBytes, this._maxStorageTime];
  }

  public initialize(providerContext: ILocalStorageProviderContext, endpointUrl?: string): boolean {
    if (!this._storage) {
      return false;
    }

    let storageConfig: IOfflineChannelConfiguration = providerContext.storageConfig;
    this._payloadHelper = new PayloadHelper();
    this._endpoint = getEndpointDomain(endpointUrl || providerContext.endpoint);
    let autoClean = !!storageConfig.autoClean;

    this._maxStorageSizeInBytes = storageConfig.maxStorageSizeInBytes || DefaultMaxStorageSizeInBytes;
    this._maxStorageTime = storageConfig.inStorageMaxTime || DefaultMaxInStorageTime;
    let dropNum = storageConfig.EventsToDropPerTime;
    this._eventDropPerTime = isNotNullOrUndefined(dropNum) ? dropNum : EventsToDropAtOneTime;
    this._maxCriticalCnt = storageConfig.maxCriticalEvtsDropCnt || MaxCriticalEvtsDropCnt;

    this._storageKeyPrefix = storageConfig.storageKeyPrefix || DefaultStorageKey;
    this._storageKey = this._storageKeyPrefix + "_" + Version + "_" + this._endpoint;

    if (autoClean) {
      this.clean();
    }

    return true;
  }

  public supportsSyncRequests(): boolean {
    return false;
  }

  public getAllEvents(cnt?: number): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    if (!this._storage) {
      return;
    }
    return this._getEvts(cnt);
  }

  public getNextBatch(): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    if (!this._storage) {
      return;
    }
    return this._getEvts(1, true);
  }

  private _getEvts(cnt?: number, ordered?: boolean) {
    let allItems: IStorageTelemetryItem[] = [];

    return this._fetchStoredDb(this._storageKey as string)
      .then(theStore => {
        let events = theStore.db.evts;

        forEachMap(events, (evt) => {
          if (evt) {
            if (evt.isArr && this._payloadHelper) {
              evt = this._payloadHelper.base64ToArr(evt);
            }
            allItems.push(evt);
          }
          if (cnt && allItems && allItems.length == cnt) {
            return false;
          }
          return true;
        }, ordered);

        return allItems;
      });
  }

  public addEvent(key: string, evt: IStorageTelemetryItem, itemCtx: any /*IProcessTelemetryContext*/): IStorageTelemetryItem | Promise<IStorageTelemetryItem> | null {
    return this._fetchStoredDb(this._storageKey as string)
      .then(theStore => {
        evt.id = evt.id || getTimeId();
        evt.criticalCnt = evt.criticalCnt || 0;
        let events = theStore.db.evts;
        let id = evt.id;
        if (evt && evt.isArr && this._payloadHelper) {
          evt = this._payloadHelper.base64ToStr(evt);
        }
        let preDroppedCnt = 0;

        // eslint-disable-next-line no-constant-condition
        while (true && evt) {
          events[id] = evt;

          return this._updateStoredDb(theStore)
            .then(x => {
              if (x) {
                return evt;
              }
              else {
                delete events[id];
                let droppedCnt = _dropEventsUpToPersistence(this._maxCriticalCnt as number, events, this._eventDropPerTime as number);
                preDroppedCnt += droppedCnt;
                if (!droppedCnt) {
                  return createAsyncRejectedPromise(new Error("Unable to free up event space"));
                }
              }
            });
        }
      });
  }

  public removeEvents(evts: IStorageTelemetryItem[]): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    return this._fetchStoredDb(this._storageKey as string, false)
      .then(theStore => {
        let currentDb = theStore.db;
        if (currentDb) {
          let events = currentDb.evts;

          for (let i = 0; i < evts.length; ++i) {
            let evt = evts[i];
            delete events[evt.id];
          }

          return this._updateStoredDb(theStore)
            .then(x => {
              if (x) {
                return evts;
              } else {
                return this._clearDatabase(theStore.key);
              }
            })
            .catch(_ => {
              // Storage Corrupted
              return this._clearDatabase(theStore.key);
            });
        }

        return evts;
      });
  }

  public clear(): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    let removedItems: IStorageTelemetryItem[] = [];
    return this._fetchStoredDb(this._storageKey as string, false)
      .then(theStore => {
        let storedDb = theStore.db;
        if (storedDb) {
          let events = storedDb.evts;
          forEachMap(events, (evt) => {
            if (evt) {
              delete events[evt.id];
              removedItems.push(evt);
            }
            return true;
          });

          return this._updateStoredDb(theStore)
            .then(_ => {
              return removedItems;
            });
        }

        return removedItems;
      });
  }

  public clean(): boolean | Promise<boolean> {
    return this._fetchStoredDb(this._storageKey as string, false)
      .then(storeDetails => {
        let currentDb = storeDetails.db;
        if (currentDb) {
          let events = currentDb.evts;
          try {
            let isDropped = _dropMaxTimeEvents(this._maxStorageTime, events, this._eventDropPerTime);
            if (isDropped) {
              return this._updateStoredDb(storeDetails);
            }
            return true;
          } catch (e) {
            // should not throw errors here
          }
          return false;
        }
        return true;
      });
  }

  public teardown(): void {
    this._fetchStoredDb(this._storageKey as string, false)
      .then(theStore => {
        let storedDb = theStore.db;
        if (storedDb) {
          return this._updateStoredDb(theStore, false);
        }
      })
      .catch(e => {
        // Add diagnostic logging
      });
  }

  private async _fetchStoredDb(dbKey: string | null, returnDefault = true): Promise<IJsonStoreDetails> {
    let dbToStore: { evts: { [key: string]: IStorageTelemetryItem } } | null = null;
    if (this._storage && dbKey) {
      let previousDb: any = null;
      try {
        previousDb = this._storage.getItem && await this._storage.getItem(dbKey);
      } catch { previousDb = null; }

      if (previousDb) {
        try {
          dbToStore = getJSON().parse(previousDb);
        } catch (e) {
          // storage corrupted
          try { this._storage.removeItem && await this._storage.removeItem(dbKey); } catch { /* noop */ }
        }
      }

      if (returnDefault && !dbToStore) {
        dbToStore = {
          evts: {},
        };
      }
    }

    return {
      key: dbKey,
      db: dbToStore
    } as IJsonStoreDetails;
  }

  private async _updateStoredDb(jsonStore: IJsonStoreDetails, updateLastAccessTime = true): Promise<boolean> {
    let dbToStore = jsonStore.db;

    try {
      let jsonString = getJSON().stringify(dbToStore);
      if (jsonString.length > this._maxStorageSizeInBytes) {
        return false;
      }

      this._storage && this._storage.setItem && await this._storage.setItem(jsonStore.key, jsonString);
    } catch (e) {
      return false;
    }

    return true;
  }

  private async _clearDatabase(dbKey: string): Promise<IStorageTelemetryItem[]> {
    let removedItems: IStorageTelemetryItem[] = [];
    let storeDetails = await this._fetchStoredDb(dbKey, false);
    let currentDb = storeDetails.db;
    if (currentDb) {
      let events = currentDb.evts;
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

      this._storage && this._storage.removeItem && await this._storage.removeItem(storeDetails.key);
    }

    return removedItems;
  }
}

export class AsyncStorageUnloadProvider extends AsyncStorageProvider {

  constructor(id?: string) {
    super(id);
  }

  initialize(providerContext: ILocalStorageProviderContext): boolean {
    super.initialize(providerContext);
    return true;
  }

  override supportsSyncRequests(): boolean {
    return true;
  }

  override addEvent(key: string, evt: IStorageTelemetryItem, itemCtx: any /* IProcessTelemetryContext */): IStorageTelemetryItem | Promise<IStorageTelemetryItem> | null {
    super.addEvent(key, evt, itemCtx);
    return null;
  }

  override getNextBatch(): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    return [];
  }

  override getAllEvents(cnt?: number): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    return [];
  }

  override removeEvents(evts: IStorageTelemetryItem[]): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    return [];
  }

  override clear(): IStorageTelemetryItem[] | Promise<IStorageTelemetryItem[]> | null {
    return [];
  }

  override clean(disable?: boolean): boolean | Promise<boolean> {
    return true;
  }

  override teardown(): void {
  }

}