const fetch = require('node-fetch');

async function debugPrinter() {
    const baseUrl = 'http://127.0.0.1:5050';

    console.log(`--- Iniciando Diagnóstico de Impressão ---`);
    console.log(`Tentando conectar em ${baseUrl}/health...`);

    try {
        const healthRes = await fetch(`${baseUrl}/health`);
        const healthData = await healthRes.json();
        console.log(`Status do Servidor:`, healthData);

        console.log(`\nBuscando impressoras disponíveis...`);
        const printersRes = await fetch(`${baseUrl}/printers`);
        const printers = await printersRes.json();
        console.log(`Impressoras encontradas:`, JSON.stringify(printers, null, 2));

        if (Array.isArray(printers) && printers.length > 0) {
            console.log(`\nSUCESSO: Servidor está online e detectou ${printers.length} impressoras.`);
            console.log(`Verifique se o nome da sua impressora física está na lista acima.`);
        } else {
            console.warn(`\nAVISO: Servidor logado, mas nenhuma impressora foi encontrada.`);
        }

    } catch (error) {
        console.error(`\nERRO CRÍTICO: Não foi possível conectar ao servidor de impressão.`);
        console.error(`Certifique-se de que o App Papaléguas (Electron) está aberto.`);
        console.error(`Detalhes:`, error.message);
    }
}

debugPrinter();
