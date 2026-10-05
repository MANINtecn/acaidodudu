/**
 * Preferência do CHECKOUT por máquina (05/10/2026, pedido do Ikarus: "preciso das 2 versões").
 *
 *  - V1 (padrão, a de sempre): no Dinheiro exige digitar o "Valor Recebido" para mostrar o troco.
 *  - V2 (rápido): sem "Valor Recebido" nem troco — escolhe a forma (D/C/P) e Enter finaliza.
 *
 * Fica no localStorage do computador: cada PC escolhe a sua versão e não depende de coluna nova
 * no banco. Lido toda vez que o checkout abre, então a troca vale na hora, sem reiniciar.
 */
const CHAVE = 'checkoutRapidoV2';

export const checkoutRapidoAtivo = (): boolean => {
    try {
        return localStorage.getItem(CHAVE) === '1';
    } catch {
        return false;
    }
};

export const definirCheckoutRapido = (ativo: boolean): void => {
    try {
        localStorage.setItem(CHAVE, ativo ? '1' : '0');
    } catch {
        /* sem armazenamento: continua na V1 */
    }
};
