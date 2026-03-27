(function (global) {
  const state = {
    cacheVersion: (global.INSIGHT_MANIFEST && global.INSIGHT_MANIFEST.version) || String(Date.now()),
    reportPromises: new Map(),
    reportCache: new Map()
  };

  function getManifest() {
    return global.INSIGHT_MANIFEST || { version: state.cacheVersion, files: [], latest: '' };
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

  function getLatestDay() {
    const manifest = getManifest();
    if (manifest.latest) {
      return manifest.latest;
    }
    return getAvailableDays()[0] || '';
  }

  function withCacheVersion(path) {
    return path + '?v=' + encodeURIComponent(state.cacheVersion);
  }

  function loadReport(day) {
    const fileName = String(day || '').replace(/\.json$/i, '') + '.json';
    if (state.reportPromises.has(fileName)) {
      return state.reportPromises.get(fileName);
    }

    const promise = fetch(withCacheVersion('insights/' + fileName), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (payload) {
        state.reportCache.set(fileName, payload);
        return payload;
      })
      .catch(function (error) {
        state.reportPromises.delete(fileName);
        throw error;
      });

    state.reportPromises.set(fileName, promise);
    return promise;
  }

  global.InsightStore = {
    getFiles: getFiles,
    getAvailableDays: getAvailableDays,
    getLatestDay: getLatestDay,
    loadReport: loadReport
  };
})(window);
