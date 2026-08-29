import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session<br/>
  atendimentoId: string<br/>
  onBack: () => void
}

interface AtendimentoGestor {
  id: string<br/>
  numero: number<br/>
  status: string<br/>
  tipo_atendimento: string<br/>
  subtipo_revisao: string | null<br/>
  responsavel_nome: string<br/>
  relato_entrada: string<br/>
  garantia_status: string<br/>
  clientes: { razao_social: string } | null<br/>
  veiculos: { placa_traseira: string } | null<br/>
  equipamentos: { modelo: string; numero_serie: string } | null
}

interface ItemExecucao {
  id: string<br/>
  tipo: string<br/>
  codigo_peca: string | null<br/>
  codigo_servico: string | null<br/>
  descricao: string<br/>
  quantidade: number<br/>
  unidade: string<br/>
  horas_padrao: number | null<br/>
  observacao: string | null<br/>
  acao: string | null<br/>
  componente: string | null<br/>
  manual: boolean
}

interface RespostaChecklist {
  id: string<br/>
  resposta: string<br/>
  observacao: string | null<br/>
  checklist_itens: { secao: string; componente: string; acoes: string } | null
}

export default function CentralGestor({ session, atendimentoId, onBack }: Props) {
  const [atendimento, setAtendimento] = useState<AtendimentoGestor | null>(null)
  const [itens, setItens] = useState<ItemExecucao[]>([])
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
    setErro('')

    const { data: atend, error: errAtend } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_atendimento, subtipo_revisao, responsavel_nome,
        relato_entrada, garantia_status,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('id', atendimentoId)
      .single()

    if (errAtend) {
      setErro('Erro ao carregar atendimento: ' + errAtend.message)
      setLoading(false)
      return
    }
    if (atend) setAtendimento(atend as unknown as AtendimentoGestor)

    const { data: itensData, error: errItens } = await supabase
      .from('itens_execucao')
      .select('id, tipo, codigo_peca, codigo_servico, descricao, quantidade, unidade, horas_padrao, observacao, acao, componente, manual')
      .eq('atendimento_id', atendimentoId)
      .order('tipo')
      .order('descricao')

    if (errItens) {
      setErro('Erro ao carregar itens: ' + errItens.message)
    } else if (itensData) {
      setItens(itensData as ItemExecucao[])
    }

    const { data: respData } = await supabase
      .from('checklist_respostas')
      .select(`
        id, resposta, observacao,
        checklist_itens ( secao, componente, acoes )
      `)
      .eq('atendimento_id', atendimentoId)
      .order('created_at')

    if (respData) setRespostas(respData as unknown as RespostaChecklist[])

    setLoading(false)
  }

  async function aprovar() {
    setProcessando(true)
    setErro('')

    const { error: errUpdate } = await supabase
      .from('atendimentos')
      .update({ status: 'AGUARDANDO_ORCAMENTO' })
      .eq('id', atendimentoId)

    if (errUpdate) {
      setErro('Erro ao aprovar: ' + errUpdate.message)
      setProcessando(false)
      return
    }

    const { error: errVal } = await supabase
      .from('validacoes_gestor_oficina')
      .insert({
        atendimento_id: atendimentoId,<br/>
        acao: 'APROVADO',<br/>
        observacao: 'Diagnóstico aprovado pelo gestor',<br/>
        responsavel_id: session.user.id,
      })

    if (errVal) {
      setErro('Erro ao registrar validação: ' + errVal.message)
    } else {
      onBack()
    }

    setProcessando(false)
  }

  async function devolver() {
    if (!motivoDevolucao.trim()) {
      setErro('Descreva o motivo da devolução')
      return
    }

    setProcessando(true)
    setErro('')

    const { error: errUpdate } = await supabase
      .from('atendimentos')
      .update({ status: 'EM_ANALISE_TECNICA' })
      .eq('id', atendimentoId)

    if (errUpdate) {
      setErro('Erro ao devolver: ' + errUpdate.message)
      setProcessando(false)
      return
    }

    const { error: errVal } = await supabase
      .from('validacoes_gestor_oficina')
      .insert({
        atendimento_id: atendimentoId,<br/>
        acao: 'DEVOLVIDO',<br/>
        observacao: motivoDevolucao,<br/>
        responsavel_id: session.user.id,
      })

    if (errVal) {
      setErro('Erro ao registrar devolução: ' + errVal.message)
    } else {
      onBack()
    }

    setProcessando(false)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">Carregando...</div></div>
  }

  const pecas = itens.filter(i => i.tipo === 'PECA')
  const servicos = itens.filter(i => i.tipo === 'SERVICO')
  const tempoTotal = servicos.reduce((acc, s) => acc + (s.horas_padrao || 0) * s.quantidade, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="text-blue-200 hover:text-white">← Voltar</button>
          <h1 className="text-lg font-bold">Validação #{atendimento?.numero}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {erro}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Dados do Atendimento</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-400">Cliente</p><p className="text-gray-800">{atendimento?.clientes?.razao_social || '—'}</p></div>
            <div><p className="text-gray-400">Placa</p><p className="text-gray-800">{atendimento?.veiculos?.placa_traseira || '—'}</p></div>
            <div><p className="text-gray-400">Modelo</p><p className="text-gray-800">{atendimento?.equipamentos?.modelo || '—'}</p></div>
            <div><p className="text-gray-400">Série</p><p className="text-gray-800">{atendimento?.equipamentos?.numero_serie || '—'}</p></div>
            <div><p className="text-gray-400">Responsável</p><p className="text-gray-800">{atendimento?.responsavel_nome || '—'}</p></div>
            <div><p className="text-gray-400">Garantia</p><p className="text-gray-800">{atendimento?.garantia_status || '—'}</p></div>
            <div><p className="text-gray-400">Tipo</p><p className="text-gray-800">{atendimento?.tipo_atendimento === 'REVISAO' ? `Revisão ${atendimento?.subtipo_revisao || ''}` : 'Serviço Comum'}</p></div>
          </div>
        </div>

        {atendimento?.relato_entrada && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-2">Relato do Cliente</h2>
            <p className="text-gray-700 text-sm">{atendimento.relato_entrada}</p>
          </div>
        )}

        {pecas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">Peças e Materiais ({pecas.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-400 font-medium">Código</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Descrição</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Qtd</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Un</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {pecas.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{p.codigo_peca || '—'}</td>
                    <td className="py-2 text-gray-800">{p.descricao}</td>
                    <td className="py-2 text-right text-gray-800">{p.quantidade}</td>
                    <td className="py-2 text-right text-gray-800">{p.unidade}</td>
                    <td className="py-2 text-gray-500 text-xs">{p.manual ? 'Manual' : 'Checklist'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {servicos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">Serviços ({servicos.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-400 font-medium">Código</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Descrição</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Qtd</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Tempo</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {servicos.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{s.codigo_servico || '—'}</td>
                    <td className="py-2 text-gray-800">{s.descricao}</td>
                    <td className="py-2 text-right text-gray-800">{s.quantidade}</td>
                    <td className="py-2 text-right text-gray-800">{s.horas_padrao !== null ? `${s.horas_padrao} h` : 'Pendente'}</td>
                    <td className="py-2 text-gray-500 text-xs">{s.manual ? 'Manual' : 'Checklist'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tempoTotal > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-right">
                <p className="text-sm text-gray-600">Tempo total: <strong>{tempoTotal} h</strong></p>
              </div>
            )}
          </div>
        )}

        {itens.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
            Nenhum item de execução encontrado para este atendimento.
          </div>
        )}

        {respostas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <button onClick={() => setMostrarChecklist(!mostrarChecklist)} className="w-full flex items-center justify-between text-left">
              <h2 className="font-bold text-gray-800">Checklist Completo ({respostas.length} respostas)</h2>
              <span className="text-gray-400">{mostrarChecklist ? '▲' : '▼'}</span>
            </button>
            {mostrarChecklist && (
              <div className="mt-4 space-y-2">
                {respostas.map((r) => (
                  <div key={r.id} className="border-b border-gray-100 pb-2 text-sm">
                    <p className="text-gray-400 text-xs">{r.checklist_itens?.secao || '—'} • {r.checklist_itens?.componente || '—'}</p>
                    <p className="text-gray-800">{r.resposta}{r.observacao ? ` — ${r.observacao}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!showDevolucao ? (
          <div className="flex gap-3">
            <button
              onClick={aprovar}
              disabled={processando}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {processando ? 'Processando...' : '✓ Aprovar Diagnóstico'}
            </button>
            <button
              onClick={() => setShowDevolucao(true)}
              disabled={processando}
              className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
            >
              ✗ Devolver ao Técnico
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
            <h3 className="font-bold text-gray-800">Motivo da Devolução</h3>
            <textarea
              value={motivoDevolucao}
              onChange={(e) => setMotivoDevolucao(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Descreva o motivo..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDevolucao(false); setMotivoDevolucao('') }}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={devolver}
                disabled={processando}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {processando ? 'Processando...' : 'Confirmar Devolução'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
