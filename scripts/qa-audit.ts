import { chromium } from '@playwright/test';
import * as fs from 'fs';

const APP = process.env.APP_URL || 'https://kitchenos-three.vercel.app';
const PASS = process.env.ORIGEN_PASS || 'password123';

// 3 perfiles a testear — roles reales: owner / chef / staff
const USERS = [
  { email: 'marcos@origen-resto.com', rol: 'owner', flows: ['/', '/tareas', '/checklist', '/recetario', '/reportes', '/pedidos'] },
  { email: 'laura@origen-resto.com',  rol: 'chef',  flows: ['/', '/tareas', '/checklist', '/recetario', '/stock'] },
  { email: 'rodrigo@origen-resto.com', rol: 'staff', flows: ['/', '/tareas', '/checklist'] },
];

interface Finding {
  rol: string;
  ruta: string;
  tipo: 'bug' | 'lento' | 'ux' | 'ok';
  mensaje: string;
  tiempo_ms?: number;
}

async function login(page: any, email: string, pass: string) {
  await page.goto(`${APP}/login`);
  await page.waitForLoadState('networkidle');

  // pressSequentially simula teclas reales → React onChange se dispara correctamente
  const emailInput = page.locator('input[type="email"]');
  const passInput  = page.locator('input[type="password"]');
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 40 });
  await passInput.click();
  await passInput.pressSequentially(pass, { delay: 40 });

  await page.click('button[type="submit"]');
  // Esperar a que cambie la URL (redirect post-login) o aparezca un error
  await page.waitForFunction(() => {
    return !window.location.href.includes('/login') ||
           !!document.querySelector('p[style*="f87171"]') ||  // error rojo
           (document.querySelector('button[type="submit"]') as HTMLButtonElement)?.disabled === false;
  }, { timeout: 20000 }).catch(() => {});
  const url = page.url();
  return !url.includes('/login');
}

async function auditRoute(page: any, ruta: string, rol: string): Promise<Finding> {
  const t0 = Date.now();
  try {
    await page.goto(`${APP}${ruta}`, { waitUntil: 'networkidle', timeout: 15000 });
    const tiempo_ms = Date.now() - t0;

    // Detectar errores visibles
    const errorText = await page.evaluate(() => {
      const selectors = ['[class*="error"]', '[class*="Error"]', '[role="alert"]'];
      for (const s of selectors) {
        try {
          const el = document.querySelector(s);
          if (el && el.textContent?.trim()) return el.textContent.trim();
        } catch {}
      }
      // Buscar texto "Error" en párrafos
      const ps = Array.from(document.querySelectorAll('p'));
      const errP = ps.find(p => p.textContent?.toLowerCase().startsWith('error'));
      return errP?.textContent?.trim() ?? null;
    });

    // Detectar pantalla bloqueada
    const bloqueado = await page.evaluate(() => {
      return document.body.innerText.includes('No tenés acceso') ||
             document.body.innerText.includes('sin acceso');
    });

    // Detectar spinner atascado (si hay spinner visible después de carga)
    const spinnerAtascado = await page.evaluate(() => {
      const spinners = document.querySelectorAll('[class*="spin"], [class*="loading"], [class*="Loader"]');
      return spinners.length > 0;
    });

    // Evaluar UX básico: ¿hay contenido o empty state?
    const tieneContenido = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return bodyText.length > 200;
    });

    if (bloqueado) return { rol, ruta, tipo: 'bug', mensaje: 'Acceso bloqueado — permisos incorrectos para este rol' };
    if (errorText) return { rol, ruta, tipo: 'bug', mensaje: `Error visible: ${errorText.slice(0, 100)}` };
    if (spinnerAtascado) return { rol, ruta, tipo: 'bug', mensaje: 'Spinner atascado — carga no completa', tiempo_ms };
    if (tiempo_ms > 4000) return { rol, ruta, tipo: 'lento', mensaje: `Carga lenta: ${tiempo_ms}ms`, tiempo_ms };
    if (tiempo_ms > 2000) return { rol, ruta, tipo: 'ux', mensaje: `Carga aceptable pero mejorable: ${tiempo_ms}ms`, tiempo_ms };
    if (!tieneContenido) return { rol, ruta, tipo: 'ux', mensaje: 'Pantalla vacía o sin datos de ejemplo', tiempo_ms };
    return { rol, ruta, tipo: 'ok', mensaje: `OK — ${tiempo_ms}ms`, tiempo_ms };

  } catch (e: any) {
    return { rol, ruta, tipo: 'bug', mensaje: `Timeout o crash: ${e.message?.slice(0, 80)}` };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const findings: Finding[] = [];
  const tiempos: Record<string, number[]> = {};

  for (const user of USERS) {
    console.log(`\nAuditando: ${user.email} (${user.rol})`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14
    const page = await ctx.newPage();

    const loggedIn = await login(page, user.email, PASS);
    if (!loggedIn) {
      findings.push({ rol: user.rol, ruta: '/login', tipo: 'bug', mensaje: `Login falló para ${user.email}` });
      await ctx.close();
      continue;
    }

    for (const ruta of user.flows) {
      console.log(`  ${ruta}...`);
      const f = await auditRoute(page, ruta, user.rol);
      findings.push(f);
      if (f.tiempo_ms) {
        tiempos[ruta] = tiempos[ruta] || [];
        tiempos[ruta].push(f.tiempo_ms);
      }
    }
    await ctx.close();
  }

  await browser.close();

  // Generar reporte markdown
  const bugs = findings.filter(f => f.tipo === 'bug');
  const lentos = findings.filter(f => f.tipo === 'lento');
  const ux = findings.filter(f => f.tipo === 'ux');
  const ok = findings.filter(f => f.tipo === 'ok');

  const promedioPorRuta = Object.entries(tiempos)
    .map(([r, ts]) => ({ ruta: r, promedio: Math.round(ts.reduce((a,b)=>a+b,0)/ts.length) }))
    .sort((a,b) => b.promedio - a.promedio);

  const reporte = `# KitchenOS — Reporte QA Automático
Fecha: ${new Date().toLocaleString('es-AR')}
Usuarios testeados: ${USERS.length} | Rutas auditadas: ${findings.length}

## Resumen
| Estado | Cantidad |
|--------|----------|
| 🔴 Bugs | ${bugs.length} |
| 🟡 Lentos (>4s) | ${lentos.length} |
| 🟠 UX mejorables | ${ux.length} |
| ✅ OK | ${ok.length} |

## 🔴 Bugs críticos
${bugs.length ? bugs.map(f => `- **[${f.rol}] ${f.ruta}**: ${f.mensaje}`).join('\n') : '- Ninguno encontrado'}

## 🟡 Rutas lentas
${lentos.length ? lentos.map(f => `- **${f.ruta}** (${f.rol}): ${f.tiempo_ms}ms`).join('\n') : '- Ninguna'}

## 🟠 UX a mejorar
${ux.length ? ux.map(f => `- **[${f.rol}] ${f.ruta}**: ${f.mensaje}`).join('\n') : '- Ninguna'}

## ⏱ Tiempos de carga por ruta (promedio)
${promedioPorRuta.map(r => `- ${r.ruta}: ${r.promedio}ms ${r.promedio > 4000 ? '🔴' : r.promedio > 2000 ? '🟡' : '✅'}`).join('\n')}

## Rutas OK
${ok.map(f => `- [${f.rol}] ${f.ruta}: ${f.tiempo_ms}ms`).join('\n')}
`;

  fs.writeFileSync('qa-report.md', reporte);
  console.log('\n✅ Reporte guardado en qa-report.md');
  console.log(`\nResumen: ${bugs.length} bugs | ${lentos.length} lentos | ${ux.length} UX | ${ok.length} OK`);
}

main().catch(console.error);
