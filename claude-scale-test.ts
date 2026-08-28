import { parseScaleFrame } from './src/services/scaleService.ts';
const casos = [
  ['ST,GS,   0.450kg', 0.450, true,  'frame estavel completo'],
  ['US,GS,   0.450kg', 0.450, false, 'frame INSTAVEL deve recusar estabilidade'],
  ['\x02 0.450\x03',   0.450, true,  'sem flag ST/US: estabilidade fica por conta da repeticao (a Urano do cliente nunca envia flag)'],
  ['ST,GS,   1.250kg', 1.250, true,  'peso com kg inteiro'],
  ['ST,GS,   1.2',     0,     false, 'FRAME TRUNCADO deve ser recusado (bug antigo: virava 1.2)'],
  ['ST,GS, 000450',    0.450, true,  'gramas 6 digitos'],
  ['00222',    0.222, true,  'REAL: frame da Urano US 31/2 POS do cliente (222g medidos)'],
  ['00222',            0.222, true,  'REAL: mesmo frame ja sem STX/ETX (como chega ao parser)'],
  ['01250',    1.250, true,  'REAL: mesmo formato com 1.250kg'],
  ['00000',    0,     true,  'REAL: balanca zerada'],
  ['002',      0,     false, 'frame curto demais = recusado'],
  ['lixo aleatorio',   0,     false, 'lixo deve ser invalido'],
  ['ST,GS, 999.999kg', 0,     false, 'acima de 30kg = lixo'],
  ['Urano US31',       0,     false, 'nome do fabricante nao pode virar peso'],
];
let falhas = 0;
for (const [entrada, pesoEsp, estavelEsp, desc] of casos) {
  const r = parseScaleFrame(entrada);
  const peso = r.valid ? r.weightKg : 0;
  const ok = Math.abs(peso - pesoEsp) < 0.0001 && r.isStable === estavelEsp;
  if (!ok) falhas++;
  console.log(`${ok?'OK  ':'FALHA'} | ${desc}\n       entrada=${JSON.stringify(entrada)} -> peso=${peso} estavel=${r.isStable} valid=${r.valid} (esperado peso=${pesoEsp} estavel=${estavelEsp})`);
}
console.log(falhas===0 ? '\n>>> TODOS OS TESTES PASSARAM' : `\n>>> ${falhas} FALHA(S)`);
