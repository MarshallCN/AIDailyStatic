(function (global) {
  const state = {
    cacheVersion: (global.NEWS_MANIFEST && global.NEWS_MANIFEST.version) || String(Date.now()),
    dayPromises: new Map(),
    dayItems: new Map(),
    preloadPromise: null
  };

  function getManifest() {
    const manifest = global.NEWS_MANIFEST;
    if (!manifest || !Array.isArray(manifest.files)) {
      throw new Error('NEWS_MANIFEST is missing or invalid.');
    }
    return manifest;
  }

  function getFiles() {
    return getManifest().files
      .slice()
      .sort((a, b) => NewsParser.parseDayFromFile(b).localeCompare(NewsParser.parseDayFromFile(a)));
  }

  function sortItems(items) {
    return items.slice().sort((a, b) => {
      if (a.date === b.date) {
        return a.title.localeCompare(b.title, 'zh-Hans-CN');
      }
      return b.date.localeCompare(a.date);
    });
  }

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(state.cacheVersion)}`;
  }

  function emit(name, detail) {
    if (typeof global.CustomEvent !== 'function') return;
    global.dispatchEvent(new global.CustomEvent(name, { detail }));
  }

  function getProgress() {
    const totalFiles = getFiles().length;
    const loadedFiles = state.dayItems.size;
    return {
      totalFiles,
      loadedFiles,
      done: totalFiles > 0 && loadedFiles >= totalFiles
    };
  }

  function loadDayFile(fileName) {
    if (state.dayPromises.has(fileName)) {
      return state.dayPromises.get(fileName);
    }

    const promise = fetch(withCacheVersion(`news/${fileName}`), { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((rawMarkdown) => {
        const parsed = NewsParser.parseNewsMarkdown(rawMarkdown, NewsParser.parseDayFromFile(fileName));
        const items = NewsParser.normalizeItems(parsed.day, parsed.items);
        state.dayItems.set(fileName, items);
        emit('newsstore:progress', getProgress());
        return items;
      })
      .catch((error) => {
        state.dayPromises.delete(fileName);
        emit('newsstore:error', { fileName, error });
        throw error;
      });

    state.dayPromises.set(fileName, promise);
    return promise;
  }

  function getCachedItems() {
    const items = [];
    getFiles().forEach((fileName) => {
      const fileItems = state.dayItems.get(fileName);
      if (Array.isArray(fileItems)) {
        items.push.apply(items, fileItems);
      }
    });
    return sortItems(items);
  }

  function preloadAll() {
    if (state.preloadPromise) {
      return state.preloadPromise;
    }

    const files = getFiles();
    state.preloadPromise = files
      .reduce((chain, fileName) => {
        return chain.then((items) => {
          return loadDayFile(fileName).then((nextItems) => items.concat(nextItems));
        });
      }, Promise.resolve([]))
      .then((items) => {
        const sorted = sortItems(items);
        emit('newsstore:ready', {
          items: sorted,
          progress: getProgress()
        });
        return sorted;
      })
      .catch((error) => {
        state.preloadPromise = null;
        throw error;
      });

    return state.preloadPromise;
  }

  function getAvailableDays() {
    return getFiles().map((fileName) => NewsParser.parseDayFromFile(fileName));
  }

  function loadItemById(id) {
    const match = String(id || '').match(/^(\d{4}-\d{2}-\d{2})-(\d+)$/);
    if (!match) {
      return Promise.resolve(null);
    }

    const day = match[1];
    const index = Number(match[2]);
    const fileName = getFiles().find((name) => NewsParser.parseDayFromFile(name) === day);

    if (!fileName) {
      return Promise.resolve(null);
    }

    return loadDayFile(fileName).then((items) => items[index] || null);
  }

  global.NewsStore = {
    getFiles,
    getAvailableDays,
    getCacheVersion: function () {
      return state.cacheVersion;
    },
    getProgress,
    getCachedItems,
    loadDayFile,
    preloadAll,
    getAllItems: preloadAll,
    loadItemById
  };
})(window);
