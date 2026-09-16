(function initCaixaStorage(globalScope) {
  'use strict';

  const DB_NAME = 'fechamento_caixa_arquivos';
  const DB_VERSION = 1;
  const STORE_NAME = 'arquivos';

  function indexedDbDisponivel() {
    return Boolean(globalScope.indexedDB);
  }

  function abrirBanco() {
    if (!indexedDbDisponivel()) {
      return Promise.reject(new Error('Seu navegador não oferece armazenamento de anexos.'));
    }

    return new Promise((resolve, reject) => {
      const request = globalScope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'chave' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir os anexos.'));
    });
  }

  async function executarTransacao(mode, executor) {
    const db = await abrirBanco();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let resultado;
        try {
          resultado = executor(store);
        } catch (error) {
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error || new Error('Falha ao acessar os anexos.'));
        tx.onabort = () => reject(tx.error || new Error('A gravação do anexo foi cancelada.'));
      });
    } finally {
      db.close();
    }
  }

  async function salvar(chave, arquivo, nomePersonalizado) {
    if (!chave || !arquivo) return null;
    const registro = {
      chave,
      nome: nomePersonalizado || arquivo.name || 'arquivo',
      tipo: arquivo.type || 'application/octet-stream',
      tamanho: arquivo.size,
      atualizadoEm: new Date().toISOString(),
      blob: arquivo,
    };
    await executarTransacao('readwrite', store => store.put(registro));
    const { blob, ...meta } = registro;
    return meta;
  }

  async function obter(chave) {
    if (!chave || !indexedDbDisponivel()) return null;
    const db = await abrirBanco();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(chave);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Falha ao ler o anexo.'));
      });
    } finally {
      db.close();
    }
  }

  async function removerPorPrefixo(prefixo) {
    if (!prefixo || !indexedDbDisponivel()) return;
    const db = await abrirBanco();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return;
          if (String(cursor.key).startsWith(prefixo)) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Falha ao remover anexos.'));
      });
    } finally {
      db.close();
    }
  }

  globalScope.CaixaStorage = { salvar, obter, removerPorPrefixo, indexedDbDisponivel };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalScope.CaixaStorage;
})(typeof window !== 'undefined' ? window : globalThis);
