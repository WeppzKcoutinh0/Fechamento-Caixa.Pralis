'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'FECHAMENTOCAIXA', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

function inlineScripts(source) {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => match[2]);
}

function functionRegion(source, functionName, nextFunctionName) {
  const startMarker = `function ${functionName}`;
  const endMarker = `function ${nextFunctionName}`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${startMarker} não foi encontrada`);
  assert.notEqual(end, -1, `${endMarker} não foi encontrada depois de ${startMarker}`);
  return source.slice(start, end);
}

test('todos os scripts inline compilam como JavaScript', () => {
  const scripts = inlineScripts(html);
  assert.ok(scripts.length > 0, 'index.html precisa conter ao menos um script inline');
  scripts.forEach((source, index) => {
    assert.doesNotThrow(
      () => new Function(source),
      `script inline ${index + 1} contém erro de sintaxe`
    );
  });
});

test('IDs estáticos do HTML não se repetem', () => {
  const ids = [...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
  const counts = new Map();
  ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => `${id} (${count}x)`);

  assert.deepEqual(duplicates, [], `IDs duplicados: ${duplicates.join(', ')}`);
});

test('index.html carrega o núcleo financeiro antes da lógica inline', () => {
  const coreScriptPattern = /<script\b[^>]*\bsrc\s*=\s*(["'])(?:\.\/)?app-core\.js\1[^>]*><\/script>/i;
  const coreMatch = coreScriptPattern.exec(html);
  const firstInlineMatch = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.exec(html);

  assert.ok(coreMatch, 'inclua <script src="app-core.js"></script> no index.html');
  assert.ok(firstInlineMatch, 'index.html precisa manter sua lógica inline');
  assert.ok(coreMatch.index < firstInlineMatch.index, 'app-core.js deve carregar antes da lógica inline');
});

test('regressão: calcTotalSangria não chama o orquestrador recalcularTudo', () => {
  const region = functionRegion(html, 'calcTotalSangria', 'calcPDV');
  assert.doesNotMatch(
    region,
    /\brecalcularTudo\s*\(/,
    'calcTotalSangria -> recalcularTudo recria recursão infinita'
  );
});
