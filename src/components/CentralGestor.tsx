import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session
  atendimentoId: string
  onBack: () => void
}

interface AtendimentoGestor {
  id: string
  numero: number
  status: string
  tipo_atendimento: string
  subtipo_revisao: string | null
  responsavel_nome: string
  relato_entrada: string
  garantia_status: string
  validacao_status: string | null
  validacao_observacao: string | null
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string; numero_serie: string } | null
}

interface PecaAtend {
  id: string
  codigo: string
  descricao: string
  quantidade: number
  unidade: string
  observacao: string | null
  origem: string
}

interface ServicoAtend {
  id: string
  codigo: string
  descricao: string
  tempo_padrao: number | null
  quantidade: number
  unidade: string
  observacao: string | null
  origem: string
}

interface RespostaChecklist {
  id: string
  condicao: string | null
  diagnostico: string | null
  acao: string
  observacao: string | null
  quantidade: number | null
  checklist_itens: { secao: string; componente: string } | null
}

export default function CentralGestor({ session, atendimentoId, onBack }: Props) {
  const [atendimento, setAtendimento] = useState<AtendimentoGestor | null>(null)
  const [pecas, setPecas] = useState<PecaAtend[]>([])
  const [servicos, setServicos] = useState<ServicoAtend[]>([])
  const [respostas, setRespostas] = useState<RespostaChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarChecklist, setMostrarChecklist] = useState(false)
  const [showDevolucao, setShowDevolucao] = useState(false)
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)

    const { data: atend } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_atendimento, subtipo_revisao, responsavel_nome,
        relato_entrada, garantia_status, validacao_status, validacao_observacao,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('id', atendimentoId)
      .single()

    if (atend) setAtendimento(atend as unknown as AtendimentoGestor)

    const { data: pecasData } = await supabase
      .from('atendimento_pecas')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .order('origem')
      .order('descricao')

    if (pecasData) setPecas(pecasData)

    const { data: servicosData } = await supabase
      .from('atendimento_servicos')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .order('origem')
      .order('descricao')

    if (servicosData) setServicos(servicosData)

    const { data: respData } = await supabase
      .from('checklist_respostas')
      .select(`
        id, condicao, diagnostico, acao, observacao, quantidade,
        checklist_itens ( secao, componente )
      `)
      .eq('atendimento_id', atendimentoId)

    if (respData) setRespostas(respData as unknown as RespostaChecklist[])

    setLoading(false)
  }

  async function atualizarPeca(id: string, campo: string, valor: string) {
    setPecas(prev => prev.map(p => p.id === id ? { ...p, [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor } : p))
    await supabase.from('atendimento_pecas').update({ [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor }).eq('id', id)
  }

  async function atualizarServico(id: string, campo: string, valor: string) {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor } : s))
    await supabase.from('atendimento_servicos').update({ [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor }).eq('id', id)
  }

  async function aprovar() {
    if (!atendimento) return
    setProcessando(true)
    setErro('')

    await supabase.from('historico_status').insert({
      atendimento_id: atendimentoId,
      status_anterior: atendimento.status,
      status_novo: 'AGUARDANDO_ORCAMENTO',
      observacao: 'Diagnóstico aprovado pelo gestor',
      alterado_por: session.user.id,
    })

    const { error } = await supabase
      .from('atendimentos')
      .update({ status: 'AGUARDANDO_ORCAMENTO', validacao_status: 'APROVADO' })
      .eq('id', atendimentoId)

    if (error) { setErro('Erro ao aprovar'); setProcessando(false); return }

    await supabase.from('validacoes_gestor_oficina').insert({
      atendimento_id: atendimentoId,
      acao: 'APROVADO',
      responsavel_id: session.user.id,
    })

    setProcessando(false)
    onBack()
  }

  async function devolver() {
    if (!atendimento || !motivoDevolucao) { setErro('Informe o motivo da devolução'); return }
    setProcessando(true)
    setErro('')

    await supabase.from('historico_status').insert({
      atendimento_id: atendimentoId,
      status_anterior: atendimento.status,
      status_novo: 'DEVOLVIDO_AO_TECNICO',
      observacao: motivoDevolucao,
      alterado_por: session.user.id,
    })

    const { error } = await supabase
      .from('atendimentos')
      .update({ status: 'DEVOLVIDO_AO_TECNICO', validacao_status: 'DEVOLVIDO', validacao_observacao: motivoDevolucao })
      .eq('id', atendimentoId)

    if (error) { setErro('Erro ao devolver'); setProcessando(false); return }

    await supabase.from('validacoes_gestor_oficina').insert({
      atendimento_id: atendimentoId,
      acao: 'DEVOLVIDO',
      observacao: motivoDevolucao,
      responsavel_id: session.user.id,
    })

    setProcessando(false)
    setShowDevolucao(false)
    setMotivoDevolucao('')
    onBack()
  }

  const intervencoes = respostas.filter(r => r.acao && r.acao !== 'OK' && r.acao !== 'N/A')

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">Carregando...</div></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="text-blue-200 hover:text-white">← Voltar</button>
          <h1 className="text-lg font-bold">Validação #{atendimento?.numero}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Dados do atendimento */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Dados do Atendimento</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-400">Cliente</p><p className="text-gray-800">{atendimento?.clientes?.razao_social || '—'}</p></div>
            <div><p className="text-gray-400">Placa</p><p className="text-gray-800">{atendimento?.veiculos?.placa_traseira || '—'}</p></div>
            <div><p className="text-gray-400">Modelo</p><p className="text-gray-800">{atendimento?.equipamentos?.modelo || '—'}</p></div>
            <div><p className="text-gray-400">Série</p><p className="text-gray-800">{atendimento?.equipamentos?.numero_serie || '—'}</p></div>
            <div><p className="text-gray-400">Responsável</p><p className="text-gray-800">{atendimento?.responsavel_nome || '—'}</p></div>
            <div><p className="text-gray-400">Tipo</p><p className="text-gray-800">{atendimento?.tipo_atendimento === 'REVISAO' ? `Revisão ${atendimento?.subtipo_revisao || ''}` : 'Serviço Comum'}</p></div>
            <div><p className="text-gray-400">Garantia</p><p className="text-gray-800">{atendimento?.garantia_status || '—'}</p></div>
          </div>
          {atendimento?.relato_entrada && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-400 text-sm mb-1">Relato de entrada</p>
              <p className="text-gray-700 text-sm">{atendimento.relato_entrada}</p>
            </div>
          )}
        </div>

        {/* Intervenções resumidas */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Intervenções ({intervencoes.length})</h2>
          {intervencoes.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma intervenção registrada.</p>
          ) : (
            <div className="space-y-2">
              {intervencoes.map((r) => (
                <div key={r.id} className="flex items-start gap-3 text-sm">
                  <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium whitespace-nowrap">{r.acao}</span>
                  <div>
                    <p className="text-gray-800">{r.checklist_itens?.componente || '—'}</p>
                    <p className="text-gray-400 text-xs">{r.checklist_itens?.secao || '—'}</p>
                    {r.condicao && <p className="text-gray-500 text-xs mt-1">Condição: {r.condicao}</p>}
                    {r.diagnostico && <p className="text-gray-500 text-xs">Causa: {r.diagnostico}</p>}
                    {r.observacao && <p className="text-gray-500 text-xs">Obs: {r.observacao}</p>}
                    {r.quantidade && <p className="text-gray-500 text-xs">Qtd: {r.quantidade}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Peças */}
        {pecas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">Peças e Materiais ({pecas.length})</h2>
            <div className="space-y-3">
              {pecas.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-gray-800 font-medium text-sm">{p.codigo} - {p.descricao}</p>
                      <p className="text-gray-400 text-xs">Origem: {p.origem === 'CHECKLIST' ? 'Checklist' : 'Manual'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" value={p.quantidade} onChange={(e) => atualizarPeca(p.id, 'quantidade', e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm" step="0.01" />
                    <span className="text-gray-400 text-sm py-1">{p.unidade}</span>
                    <input type="text" value={p.observacao || ''} onChange={(e) => atualizarPeca(p.id, 'observacao', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" placeholder="Observação..." />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Serviços */}
        {servicos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">Serviços ({servicos.length})</h2>
            <div className="space-y-3">
              {servicos.map((s) => (
                <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-gray-800 font-medium text-sm">{s.codigo && `${s.codigo} - `}{s.descricao}</p>
                      <p className="text-gray-400 text-xs">
                        Tempo: {s.tempo_padrao !== null ? `${s.tempo_padrao}h` : 'Pendente'} • Origem: {s.origem === 'CHECKLIST' ? 'Checklist' : 'Manual'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" value={s.quantidade} onChange={(e) => atualizarServico(s.id, 'quantidade', e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm" step="0.01" />
                    <span className="text-gray-400 text-sm py-1">{s.unidade}</span>
                    <input type="text" value={s.observacao || ''} onChange={(e) => atualizarServico(s.id, 'observacao', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" placeholder="Observação..." />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist completo recolhido */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <button onClick={() => setMostrarChecklist(!mostrarChecklist)} className="w-full flex items-center justify-between text-left">
            <h2 className="font-bold text-gray-800">Checklist Completo ({respostas.length} respostas)</h2>
            <span className="text-gray-400">{mostrarChecklist ? '▲' : '▼'}</span>
          </button>
          {mostrarChecklist && (
            <div className="mt-4 space-y-2">
              {respostas.map((r) => (
                <div key={r.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                    r.acao === 'OK' ? 'bg-green-100 text-green-700' : r.acao === 'N/A' ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-700'
                  }`}>{r.acao}</span>
                  <div>
                    <p className="text-gray-700">{r.checklist_itens?.componente || '—'}</p>
                    <p className="text-gray-400 text-xs">{r.checklist_itens?.secao || '—'}</p>
                    {r.condicao && <p className="text-gray-500 text-xs">Condição: {r.condicao}</p>}
                    {r.diagnostico && <p className="text-gray-500 text-xs">Diagnóstico: {r.diagnostico}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {erro && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{erro}</div>}

        {/* Ações */}
        {!showDevolucao ? (
          <div className="flex gap-3">
            <button onClick={() => setShowDevolucao(true)} disabled={processando}
              className="flex-1 py-3 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50">
              Devolver ao Técnico
            </button>
            <button onClick={aprovar} disabled={processando}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
              {processando ? 'Processando...' : 'Aprovar Diagnóstico'}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <h3 className="font-bold text-gray-800">Motivo da Devolução</h3>
            <textarea value={motivoDevolucao} onChange={(e) => setMotivoDevolucao(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Descreva o motivo..." />
            <div className="flex gap-3">
              <button onClick={() => { setShowDevolucao(false); setMotivoDevolucao('') }}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={devolver} disabled={processando || !motivoDevolucao}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                {processando ? 'Devolvendo...' : 'Confirmar Devolução'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
