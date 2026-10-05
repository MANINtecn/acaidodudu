/**
 * Trava de envio da comanda (Balcão V2) -- auditoria de 05/10/2026.
 *
 * Problema real (pedidos #8-#11, 4 envios em 0,9 s): Enter/F7/F8 repetidos disparavam vários
 * handleFinalize ao mesmo tempo. A trava antiga (isProcessing) só valia DEPOIS do próximo
 * render e o F7/F8 nem passava por ela -- cada chamada gravava um pedido novo.
 *
 * Aqui a trava é SÍNCRONA (fora do React): enquanto um envio está em andamento, qualquer outra
 * chamada NÃO executa de novo -- recebe a MESMA promessa do envio em curso (o F7 que pediu
 * "envie e abra o checkout" continua esperando o resultado certo). Terminou, libera.
 */
export function criarEnvioUnico<T>() {
    let emCurso: Promise<T> | null = null;
    const executar = (fn: () => Promise<T>): Promise<T> => {
        if (emCurso) return emCurso;
        const p = (async () => fn())().finally(() => {
            if (emCurso === p) emCurso = null;
        });
        emCurso = p;
        return p;
    };
    executar.emAndamento = () => emCurso !== null;
    return executar;
}
