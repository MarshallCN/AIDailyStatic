(function (global) {
  const state = {
    cacheVersion: (global.KG_MANIFEST && global.KG_MANIFEST.version) || String(Date.now()),
    dayPromises: new Map(),
    dayData: new Map(),
    preloadPromise: null
  };

  function getManifest() {
    return global.KG_MANIFEST || { version: state.cacheVersion, files: [] };
  }

  function parseDayFromFile(fileName) {
    return String(fileName || '').replace(/\.json$/i, '');
  }

  function getFiles() {
    return (getManifest().files || []).slice().sort(function (a, b) {
      return parseDayFromFile(b).localeCompare(parseDayFromFile(a));
    });
  }

  function getAvailableDays() {
    return getFiles().map(parseDayFromFile);
  }

  function withCacheVersion(path) {
    return path + '?v=' + encodeURIComponent(state.cacheVersion);
  }

  function mapLimit(items, limit, worker) {
    if (!items.length) {
      return Promise.resolve([]);
    }

    const results = new Array(items.length);
    let cursor = 0;
    let running = 0;

    return new Promise(function (resolve) {
      function doneOne() {
        running -= 1;
        if (cursor >= items.length && running === 0) {
          resolve(results);
          return;
        }
        pump();
      }

      function pump() {
        while (running < limit && cursor < items.length) {
          (function (index) {
            running += 1;
            Promise.resolve(worker(items[index], index)).then(function (value) {
              results[index] = value;
              doneOne();
            }, function () {
              results[index] = null;
              doneOne();
            });
          }(cursor));
          cursor += 1;
        }
      }

      pump();
    });
  }

  function loadDayFile(fileName) {
    if (state.dayPromises.has(fileName)) {
      return state.dayPromises.get(fileName);
    }

    const promise = fetch(withCacheVersion('kg/' + fileName), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (payload) {
        state.dayData.set(fileName, payload);
        return payload;
      })
      .catch(function (error) {
        state.dayPromises.delete(fileName);
        throw error;
      });

    state.dayPromises.set(fileName, promise);
    return promise;
  }

  function filesInRange(startDate, endDate) {
    return getFiles().filter(function (fileName) {
      const day = parseDayFromFile(fileName);
      if (startDate && day < startDate) {
        return false;
      }
      if (endDate && day > endDate) {
        return false;
      }
      return true;
    });
  }

  function flattenPayloads(chunks) {
    return (chunks || []).filter(function (payload) {
      return payload && typeof payload === 'object';
    });
  }

  function loadFiles(fileNames) {
    return mapLimit(fileNames, 6, function (fileName) {
      return loadDayFile(fileName).catch(function () {
        return null;
      });
    }).then(flattenPayloads);
  }

  function loadRange(startDate, endDate) {
    return loadFiles(filesInRange(startDate, endDate));
  }

  function preloadAll() {
    if (state.preloadPromise) {
      return state.preloadPromise;
    }

    state.preloadPromise = loadFiles(getFiles())
      .catch(function (error) {
        state.preloadPromise = null;
        throw error;
      });

    return state.preloadPromise;
  }

  function getCachedDayData() {
    const items = [];
    getFiles().forEach(function (fileName) {
      const payload = state.dayData.get(fileName);
      if (payload) {
        items.push(payload);
      }
    });
    return items;
  }

  function getCachedSignalRecords() {
    const records = [];
    getCachedDayData().forEach(function (payload) {
      const items = Array.isArray(payload && payload.signal_records) ? payload.signal_records : [];
      records.push.apply(records, items);
    });
    return records;
  }

  global.KGStore = {
    getFiles: getFiles,
    getAvailableDays: getAvailableDays,
    filesInRange: filesInRange,
    loadDayFile: loadDayFile,
    loadRange: loadRange,
    loadFiles: loadFiles,
    preloadAll: preloadAll,
    getCachedDayData: getCachedDayData,
    getCachedSignalRecords: getCachedSignalRecords,
    getCacheVersion: function () {
      return state.cacheVersion;
    }
  };
})(window);
