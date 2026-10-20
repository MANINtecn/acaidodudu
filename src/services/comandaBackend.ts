/**
 * Despachante das comandas do Balcão V2 (15/10/2026).
 *
 * Mesmos nomes e mesmas respostas das funções do supabaseService que o Balcão e o
 * F8 já usam. Com o modo offline LIGADO nesta máquina (e a loja em Balcão V2), vão
 * para o armazém local (offline/armazemBalcao.ts); desligado, vão para o banco
 * exatamente como antes. A tela não precisa saber onde a comanda mora.
 */
import * as remoto from './supabaseService';
import * as local from '../offline/armazemBalcao';
import type { Order } from '../types';

let balcaoV2DaLoja = false;
/** O AdminPage avisa se a loja está em Balcão V2 (o offline só vale para a V2). */
export const definirContextoBalcao = (v2: boolean) => { balcaoV2DaLoja = v2; };
export const usandoComandaLocal = (): boolean => balcaoV2DaLoja && local.modoOfflineAtivo();

export const fetchAllOpenOrdersForTable = async (storeId: string, tableNumber: number): Promise<Order[]> =>
    usandoComandaLocal() ? local.pedidosAbertosDaComanda(tableNumber) : remoto.fetchAllOpenOrdersForTable(storeId, tableNumber);

export const updateOrder = async (orderId: string, updates: any) =>
    usandoComandaLocal() && String(orderId).startsWith('L-') ? local.atualizarPedidoLocal(orderId, updates) : remoto.updateOrder(orderId, updates);

export const deleteOrder = async (orderId: string) =>
    usandoComandaLocal() && String(orderId).startsWith('L-') ? local.apagarPedidoLocal(orderId) : remoto.deleteOrder(orderId);

export const clearTablePayments = async (storeId: string, tableNumber: number) =>
    usandoComandaLocal() ? local.limparPagamentosComanda(tableNumber) : remoto.clearTablePayments(storeId, tableNumber);

// F8 (dividir conta)
export const getTableBalance = async (storeId: string, tableNumber: number) =>
    usandoComandaLocal() ? local.saldoComandaLocal(tableNumber) as any : remoto.getTableBalance(storeId, tableNumber);

export const addTablePayment = async (params: Parameters<typeof remoto.addTablePayment>[0]) =>
    usandoComandaLocal() ? local.adicionarPagamentoLocal(params) as any : remoto.addTablePayment(params);

export const voidTablePayment = async (paymentId: string, reason?: string) =>
    usandoComandaLocal() ? local.estornarPagamentoLocal(paymentId) : remoto.voidTablePayment(paymentId, reason);

export const settleTable = async (storeId: string, tableNumber: number, force = false, waiterName?: string) =>
    usandoComandaLocal() ? local.fecharComandaPorSaldoLocal(tableNumber, force) : remoto.settleTable(storeId, tableNumber, force, waiterName);

// Sem versão local (cliente/entrega continuam online)
export const fetchCustomerByPhone = remoto.fetchCustomerByPhone;
export const upsertCustomer = remoto.upsertCustomer;
export const searchCustomers = remoto.searchCustomers;
