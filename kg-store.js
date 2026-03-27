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

  function getFiles() {
    return (getManifest().files || []).slice().sort(function (a, b) {
      const left = String(a || '').replace(/\.json$/i, '');
      const right = String(b || '').replace(/\.json$/i, '');
      return right.localeCompare(left);
    });
  }

  function getAvailableDays() {
    return getFiles().map(function (fileName) {
      return String(fileName || '').replace(/\.json$/i, '');
    });
  }

  function withCacheVersion(path) {
    return path + '?v=' + encodeURIComponent(state.cacheVersion);
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

  function preloadAll() {
    if (state.preloadPromise) {
      return state.preloadPromise;
    }

    state.preloadPromise = getFiles()
      .reduce(function (chain, fileName) {
        return chain.then(function (items) {
          return loadDayFile(fileName).then(function (payload) {
            items.push(payload);
            return items;
          });
        });
      }, Promise.resolve([]))
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
    loadDayFile: loadDayFile,
    preloadAll: preloadAll,
    getCachedDayData: getCachedDayData,
    getCachedSignalRecords: getCachedSignalRecords,
    getCacheVersion: function () {
      return state.cacheVersion;
    }
  };
})(window);
