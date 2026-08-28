export type TipoAtendimento = "REVISAO" | "SERVICO_COMUM"
export type SubtipoRevisao = "PREVENTIVA" | "CORRETIVA" | ""
export type AcaoChecklist = "OK" | "TROCAR" | "REPARAR" | "LIMPAR" | "LAVAR" | "AJUSTAR" | "COMPLETAR" | "MONITORAR" | "N/A"

export type StatusAtendimento =
  | "ABERTO"
  | "AGUARDANDO_GARANTIA"
  | "EM_DIAGNOSTICO"
  | "AGUARDANDO_VALIDACAO_GESTOR"
  | "DEVOLVIDO_AO_TECNICO"
  | "AGUARDANDO_ORCAMENTO"
  | "ORCAMENTO_GERADO"
  | "AGUARDANDO_APROVACAO_CLIENTE"
  | "APROVADO"
  | "EM_EXECUCAO"
  | "FINALIZADO"

export type PerfilUsuario = "ADMIN" | "TECNICO" | "GESTOR_OFICINA" | "RECEPCAO" | "COMERCIAL"

export interface PecaAtendimento {
  id: string
  atendimento_id: string
  codigo: string
  descricao: string
  quantidade: number
  unidade: string
  observacao?: string
  origem: "CHECKLIST" | "MANUAL"
  checklist_item_id?: string
}

export interface ServicoAtendimento {
  id: string
  atendimento_id: string
  codigo: string
  descricao: string
  tempo_padrao: number | null
  quantidade: number
  unidade: string
  procedimento?: string
  observacao?: string
  origem: "CHECKLIST" | "MANUAL"
  checklist_item_id?: string
}

export interface ChecklistResposta {
  condicao: string
  diagnostico: string
  acao: AcaoChecklist | ""
  observacao: string
  quantidade: string
  localizacao: string
}

export const ACOES_GERAM_PECA: AcaoChecklist[] = ["TROCAR"]
export const ACOES_GERAM_SERVICO: AcaoChecklist[] = ["TROCAR", "REPARAR", "LIMPAR", "LAVAR", "AJUSTAR"]
export const ACOES_GERAM_MATERIAL: AcaoChecklist[] = ["COMPLETAR"]

export const STATUS_LABELS: Record<string, string> = {
  ABERTO: "Aberto",
  AGUARDANDO_GARANTIA: "Aguardando Garantia",
  EM_DIAGNOSTICO: "Em Diagnóstico",
  AGUARDANDO_VALIDACAO_GESTOR: "Aguardando Validação",
  DEVOLVIDO_AO_TECNICO: "Devolvido ao Técnico",
  AGUARDANDO_ORCAMENTO: "Aguardando Orçamento",
  ORCAMENTO_GERADO: "Orçamento Gerado",
  AGUARDANDO_APROVACAO_CLIENTE: "Aguardando Aprovação do Cliente",
  APROVADO: "Aprovado",
  EM_EXECUCAO: "Em Execução",
  FINALIZADO: "Finalizado",
}

export const STATUS_CORES: Record<string, string> = {
  ABERTO: "bg-gray-100 text-gray-800",
  AGUARDANDO_GARANTIA: "bg-yellow-100 text-yellow-800",
  EM_DIAGNOSTICO: "bg-blue-100 text-blue-800",
  AGUARDANDO_VALIDACAO_GESTOR: "bg-orange-100 text-orange-800",
  DEVOLVIDO_AO_TECNICO: "bg-red-100 text-red-800",
  AGUARDANDO_ORCAMENTO: "bg-purple-100 text-purple-800",
  ORCAMENTO_GERADO: "bg-indigo-100 text-indigo-800",
  AGUARDANDO_APROVACAO_CLIENTE: "bg-cyan-100 text-cyan-800",
  APROVADO: "bg-green-100 text-green-800",
  EM_EXECUCAO: "bg-teal-100 text-teal-800",
  FINALIZADO: "bg-gray-200 text-gray-600",
}
