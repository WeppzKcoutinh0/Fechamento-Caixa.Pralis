import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  evaluate,
  launchBrowser,
  navigate,
  setViewport,
} from './helpers/cdp.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pageUrl = pathToFileURL(path.join(root, 'FECHAMENTOCAIXA', 'index.html')).href;
const tests = [];
const test = (name, run) => tests.push({ name, run });
const xssPayload = '<img src=x onerror="window.__xssExecuted=true">';

function inputScript(values) {
  return `(() => {
    const values = ${JSON.stringify(values)};
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (!element) throw new Error('Campo ausente: ' + id);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`;
}

async function waitUntil(client, expression, description, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout: ${description}`);
}

async function reload(client) {
  const loaded = client.waitFor('Page.loadEventFired', () => true, 15_000);
  await client.send('Page.reload', { ignoreCache: true });
  await loaded;
}

let browser;
let client;
let runtimeErrors = [];

test('carrega o arquivo local sem erros de console ou exceções', async () => {
  await setViewport(client, 1280, 900);
  await navigate(client, pageUrl);
  await waitUntil(client, `document.readyState === 'complete'`, 'documento carregar');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(runtimeErrors, [], runtimeErrors.join('\n'));
  const iconFallbacks = await evaluate(client, `(() => {
    const icon = document.querySelector('.material-icons');
    if (!icon) return [];
    const family = getComputedStyle(icon).fontFamily.toLowerCase();
    return family.includes('material icons') || family.includes('material symbols')
      ? [] : [icon.textContent.trim()];
  })()`);
  assert.deepEqual(iconFallbacks, [], `Fonte de ícones não carregada; texto visível: ${iconFallbacks.join(', ')}`);
});

test('cria e salva um fechamento com os campos principais', async () => {
  await evaluate(client, `localStorage.clear(); window.__xssExecuted = false; location.reload()`);
  await client.waitFor('Page.loadEventFired', () => true, 15_000).catch(() => {});
  await evaluate(client, `document.getElementById('btnNewFechamento').click()`);
  await evaluate(client, inputScript({
    caixa: 'Caixa 2',
    turno: 'Tarde',
    responsavel: xssPayload,
    relatorioPDV: 'Conferência PDV teste',
    nrClientes: '25',
    nrMaquininha: '77',
    pdvDinheiro: '100,00',
    pdvCredito: '250,00',
    creditoManha: '10,00',
    creditoTarde: '260,00',
  }));
  await evaluate(client, `salvarFechamento()`);
  const state = await evaluate(client, `(() => {
    const saved = JSON.parse(localStorage.getItem('fechamentos_caixa') || '[]');
    return {
      count: saved.length,
      caixa: saved[0]?.caixa,
      turno: saved[0]?.turno,
      responsavel: saved[0]?.responsavel,
      relatorioPDV: saved[0]?.relatorioPDV,
      nrClientes: saved[0]?.nrClientes,
      nrMaquininha: saved[0]?.nrMaquininha,
      pdvDinheiro: saved[0]?.pdvDinheiro,
      pdvCredito: saved[0]?.pdvCredito,
      creditoManha: saved[0]?.creditoManha,
      creditoTarde: saved[0]?.creditoTarde,
      overlayClosed: document.getElementById('formOverlay').classList.contains('hidden'),
    };
  })()`);
  assert.equal(state.count, 1);
  assert.equal(state.caixa, 'Caixa 2');
  assert.equal(state.turno, 'Tarde');
  assert.equal(state.responsavel, xssPayload);
  assert.equal(state.relatorioPDV, 'Conferência PDV teste');
  assert.equal(state.nrClientes, '25');
  assert.equal(state.nrMaquininha, '77');
  assert.equal(Number(state.pdvDinheiro), 100);
  assert.equal(Number(state.pdvCredito), 250);
  assert.equal(Number(state.creditoManha), 10);
  assert.equal(Number(state.creditoTarde), 260);
  assert.equal(state.overlayClosed, true);
});

test('recarrega, edita sem duplicar e mantém os campos principais', async () => {
  await reload(client);
  const before = await evaluate(client, `JSON.parse(localStorage.getItem('fechamentos_caixa') || '[]')`);
  assert.equal(before.length, 1);
  await evaluate(client, `editarFechamento(${JSON.stringify(before[0].id)})`);
  const restored = await evaluate(client, `(() => {
    const ids = ['caixa','turno','responsavel','relatorioPDV','nrClientes','nrMaquininha','pdvDinheiro','pdvCredito','creditoManha','creditoTarde'];
    return Object.fromEntries(ids.map(id => [id, document.getElementById(id)?.value]));
  })()`);
  assert.equal(restored.caixa, 'Caixa 2');
  assert.equal(restored.turno, 'Tarde');
  assert.equal(restored.responsavel, xssPayload);
  assert.equal(restored.relatorioPDV, 'Conferência PDV teste');
  assert.equal(restored.nrClientes, '25');
  assert.equal(restored.nrMaquininha, '77');
  assert.notEqual(restored.pdvDinheiro, '');
  assert.notEqual(restored.pdvCredito, '');
  assert.notEqual(restored.creditoManha, '');
  assert.notEqual(restored.creditoTarde, '');
  await evaluate(client, inputScript({ responsavel: 'Responsável editado' }));
  await evaluate(client, `salvarFechamento()`);
  const after = await evaluate(client, `JSON.parse(localStorage.getItem('fechamentos_caixa') || '[]')`);
  assert.equal(after.length, 1, 'Editar criou um registro duplicado');
  assert.equal(after[0].responsavel, 'Responsável editado');
  assert.equal(after[0].nrMaquininha, '77');
});

test('não executa payload XSS e o trata como texto', async () => {
  await evaluate(client, `window.__xssExecuted = false; novoFechamento()`);
  await evaluate(client, inputScript({
    caixa: 'Caixa 1',
    turno: 'Manhã',
    responsavel: xssPayload,
  }));
  await evaluate(client, `salvarFechamento()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  const xss = await evaluate(client, `({
    executed: window.__xssExecuted === true,
    literalVisible: [...document.querySelectorAll('.deck-card-name')]
      .some(element => element.textContent.includes(${JSON.stringify(xssPayload)})),
  })`);
  assert.equal(xss.executed, false, 'Payload XSS foi executado');
  assert.equal(xss.literalVisible, true, 'Payload não foi renderizado como texto literal');
});

test('não apresenta overflow horizontal em 360/768/1280/1440', async () => {
  for (const width of [360, 768, 1280, 1440]) {
    await setViewport(client, width, 900);
    await evaluate(client, `novoFechamento()`);
    await new Promise(resolve => setTimeout(resolve, 40));
    const layout = await evaluate(client, `(() => {
      const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth;
      const panel = document.getElementById('formPanel').getBoundingClientRect();
      return {
        innerWidth,
        rootOverflow,
        panelLeft: panel.left,
        panelRight: panel.right,
      };
    })()`);
    assert.ok(layout.rootOverflow <= 1, `${width}px: overflow horizontal de ${layout.rootOverflow}px`);
    assert.ok(layout.panelLeft >= -1, `${width}px: painel sai pela esquerda`);
    assert.ok(layout.panelRight <= width + 1, `${width}px: painel sai pela direita`);
    await evaluate(client, `fecharFormPanel()`);
  }
});

test('possui labels programáticos, diálogos e mensagens live', async () => {
  await setViewport(client, 1280, 900);
  await evaluate(client, `novoFechamento(); adicionarEntradaBloco(); adicionarSangriaBloco(); adicionarLancamento({ tipo: 'despesa' }); adicionarDisc({ tipo: 'mercadoria' }); adicionarCredItem('cliente')`);
  const accessibility = await evaluate(client, `(() => {
    const controls = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')];
    const unlabeled = controls.filter(control => {
      const labelledBy = (control.getAttribute('aria-labelledby') || '')
        .split(/\\s+/).filter(Boolean).every(id => document.getElementById(id));
      return !(control.labels?.length || control.getAttribute('aria-label') || (control.getAttribute('aria-labelledby') && labelledBy));
    }).map(control => control.id || control.outerHTML.slice(0, 80));
    const dialogSelectors = ['#formOverlay', '#reportOverlay', '#modalOverlay'];
    const invalidDialogs = dialogSelectors.filter(selector => {
      const host = document.querySelector(selector);
      const dialog = host?.matches('dialog,[role="dialog"]') ? host : host?.querySelector('dialog,[role="dialog"]');
      if (!dialog) return true;
      const named = dialog.getAttribute('aria-label') || (dialog.getAttribute('aria-labelledby') && document.getElementById(dialog.getAttribute('aria-labelledby')));
      return !named || (dialog.tagName !== 'DIALOG' && dialog.getAttribute('aria-modal') !== 'true');
    });
    const toast = document.getElementById('toast');
    const live = toast?.matches('[role="status"],[role="alert"],[aria-live]');
    return { unlabeled, invalidDialogs, live: Boolean(live) };
  })()`);
  assert.deepEqual(accessibility.unlabeled, [], `Campos sem label: ${accessibility.unlabeled.join(', ')}`);
  assert.deepEqual(accessibility.invalidDialogs, [], `Overlays sem semântica de diálogo: ${accessibility.invalidDialogs.join(', ')}`);
  assert.equal(accessibility.live, true, 'Toast não possui role=status/alert ou aria-live');
  await evaluate(client, `fecharFormPanel()`);
});

test('respeita prefers-reduced-motion', async () => {
  await client.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await evaluate(client, `novoFechamento(); navegarSecao(1); toggleTransfOrb()`);
  const moving = await evaluate(client, `(() => {
    const seconds = value => value.split(',').map(part => {
      const item = part.trim();
      return item.endsWith('ms') ? parseFloat(item) / 1000 : parseFloat(item) || 0;
    });
    return [...document.querySelectorAll('*')].filter(element => {
      if (element.getClientRects().length === 0) return false;
      const style = getComputedStyle(element);
      return Math.max(...seconds(style.animationDuration), ...seconds(style.transitionDuration)) > 0.05;
    }).slice(0, 12).map(element => element.id || element.className || element.tagName);
  })()`);
  assert.deepEqual(moving, [], `Animações/transições ativas em reduced-motion: ${moving.join(', ')}`);
  await evaluate(client, `fecharFormPanel()`);
  await client.send('Emulation.setEmulatedMedia', { media: '', features: [] });
});

test('exclui registros após confirmação', async () => {
  const ids = await evaluate(client, `JSON.parse(localStorage.getItem('fechamentos_caixa') || '[]').map(item => item.id)`);
  assert.ok(ids.length > 0, 'Pré-condição: nenhum registro para excluir');
  for (const id of ids) {
    await evaluate(client, `excluirFechamento(${JSON.stringify(id)})`);
    const visible = await evaluate(client, `!document.getElementById('modalOverlay').classList.contains('hidden')`);
    assert.equal(visible, true, 'Confirmação de exclusão não abriu');
    await evaluate(client, `confirmarExclusao()`);
  }
  const remaining = await evaluate(client, `JSON.parse(localStorage.getItem('fechamentos_caixa') || '[]').length`);
  assert.equal(remaining, 0);
});

async function main() {
  let failed = 0;
  try {
    browser = await launchBrowser();
    client = browser.client;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    client.on('Runtime.exceptionThrown', event => {
      runtimeErrors.push(`Exceção: ${event.exceptionDetails?.exception?.description || event.exceptionDetails?.text}`);
    });
    client.on('Runtime.consoleAPICalled', event => {
      if (event.type !== 'error') return;
      runtimeErrors.push(`console.error: ${event.args?.map(arg => arg.value || arg.description).join(' ')}`);
    });
    client.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error' && entry?.source !== 'network') runtimeErrors.push(`log: ${entry.text}`);
    });

    console.log(`Browser: ${browser.executable}`);
    console.log(`Página: ${pageUrl}\n`);
    for (const { name, run } of tests) {
      try {
        await run();
        console.log(`✓ ${name}`);
      } catch (error) {
        failed++;
        console.error(`✗ ${name}`);
        console.error(`  ${error.message.replaceAll('\n', '\n  ')}`);
      }
    }
  } finally {
    await browser?.stop();
  }

  console.log(`\nResultado: ${tests.length - failed}/${tests.length} testes aprovados.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(`Falha fatal no E2E: ${error.stack || error.message}`);
  process.exitCode = 1;
});
