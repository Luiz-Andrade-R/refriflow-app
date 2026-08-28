import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session
  onBack: () => void
}

interface AtendimentoGestor {
  id: string
  numero: number
  status: string
  tipo_servico: string
  responsavel_nome: string
  relato_entrada: string
  garantia_status: string
  validacao_status: string | null
  validacao_observacao: string | null
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string; numero_serie: string } | null
}

interface ItemExecucao {
  id: string
  descricao: string
  quantidade: number
  unidade: string
  observacao: string | null
  tipo: string
  codigo_peca: string | null
}

interface RespostaChecklist {
  id: string
  resposta: string
  observacao: string | null
  quantidade: number | null
  localizacao: string | null
  checklist_itens: {
    secao: string
    componente: string
  } | null
}

export default function CentralGestor({ session, onBack }: Props) {
  const [fila, setFila] = useState<AtendimentoGestor[]>([])
  const [selecionado, setSelecionado] = useState<AtendimentoGestor | null>(null)
  const [itens, setItens] = useState<ItemExecucao[]>([])
  const [respostas, setRespostas] = useState<RespostaChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarChecklist, setMostrarChecklist] = useState(false)
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [showDevolucao, setShowDevolucao] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarFila()
  }, [])

  async function carregarFila() {
    setLoading(true)
    const { data } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_servico, responsavel_nome, relato_entrada,
        garantia_status, validacao_status, validacao_observacao,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('status', 'AGUARDANDO_VALIDACAO_GESTOR')
      .order('numero', { ascending: true })

    if (data) setFila(data as unknown as AtendimentoGestor[])
    setLoading(false)
  }

  async function abrirAtendimento(a: AtendimentoGestor) {
    setSelecionado(a)
    setMostrarChecklist(false)
    setErro('')

    const { data: itensData } = await supabase
      .from('itens_execucao')
      .select('*')
      .eq('atendimento_id', a.id)
      .order('tipo')
      .order('descricao')

    if (itensData) setItens(itensData)

    const { data: respData } = await supabase
      .from('checklist_respostas')
      .select(`
        id, resposta, observacao, quantidade, localizacao,
        checklist_itens ( secao, componente )
      `)
      .eq('atendimento_id', a.id)

    if (respData) setRespostas(respData as unknown as RespostaChecklist[])
  }

  async function atualizarItem(itemId: string, campo: string, valor: string) {
    setItens((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor } : i
      )
    )

    await supabase
      .from('itens_execucao')
      .update({ [campo]: campo === 'quantidade' ? parseFloat(valor) || 0 : valor })
      .eq('id', itemId)
  }

  async function aprovar() {
    if (!selecionado) return
    setProcessando(true)
    setErro('')

    const { error } = await supabase
      .from('atendimentos')
      .update({
        status: 'AGUARDANDO_ORCAMENTO',
        validacao_status: 'APROVADO',
      })
      .eq('id', selecionado.id)

    if (error) {
      setErro('Erro ao aprovar diagnóstico')
      setProcessando(false)
      return
    }

    await supabase.from('validacoes_gestor_oficina').insert({
      atendimento_id: selecionado.id,
      acao: 'APROVADO',
      responsavel_id: session.user.id,
    })

    setProcessando(false)
    setSelecionado(null)
    carregarFila()
  }

  async function devolver() {
    if (!selecionado || !motivoDevolucao) {
      setErro('Informe o motivo da devolução')
      return
    }
    setProcessando(true)
    setErro('')

    const { error } = await supabase
      .from('atendimentos')
      .update({
        status: 'EM_ANALISE_TECNICA',
        validacao_status: 'DEVOLVIDO',
        validacao_observacao: motivoDevolucao,
      })
      .eq('id', selecionado.id)

    if (error) {
      setErro('Erro ao devolver diagnóstico')
      setProcessando(false)
      return
    }

    await supabase.from('validacoes_gestor_oficina').insert({
      atendimento_id: selecionado.id,
      acao: 'DEVOLVIDO',
      observacao: motivoDevolucao,
      responsavel_id: session.user.id,
    })

    setProcessando(false)
    setShowDevolucao(false)
    setMotivoDevolucao('')
    setSelecionado(null)
    carregarFila()
  }

  const pecas = itens.filter((i) => i.tipo === 'PECA')
  const servicos = itens.filter((i) => i.tipo === 'SERVICO')
  const intervencoes = respostas.filter((r) => r.resposta && r.resposta !== 'OK')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    )
  }

  if (!selecionado) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-900 text-white px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className="text-blue-200 hover:text-white">
            ← Voltar
          </button>
          <h1 className="text-lg font-bold">Central do Gestor</h1>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Fila de Validação ({fila.length})
          </h2>

          {fila.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Nenhum atendimento aguardando validação.
            </p>
          ) : (
            <div className="space-y-3">
              {fila.map((a) => (
                <button
                  key={a.id}
                  onClick={() => abrirAtendimento(a)}
                  className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-gray-800">#{a.numero}</span>
                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                      Aguardando
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {a.clientes?.razao_social || '—'} • {a.veiculos?.placa_traseira || '—'} • {a.equipamentos?.modelo || '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {a.tipo_servico} • {a.responsavel_nome || '—'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={() => setSelecionado(null)}
            className="text-blue-200 hover:text-white"
          >
            ← Voltar à fila
          </button>
          <h1 className="text-lg font-bold">Validação #{selecionado.numero}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Dados do atendimento */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">Dados do Atendimento</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400">Cliente</p>
              <p className="text-gray-800">{selecionado.clientes?.razao_social || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Placa</p>
              <p className="text-gray-800">{selecionado.veiculos?.placa_traseira || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Modelo</p>
              <p className="text-gray-800">{selecionado.equipamentos?.modelo || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Série</p>
              <p className="text-gray-800">{selecionado.equipamentos?.numero_serie || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Responsável</p>
              <p className="text-gray-800">{selecionado.responsavel_nome || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Tipo de Serviço</p>
              <p className="text-gray-800">{selecionado.tipo_servico || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Garantia</p>
              <p className="text-gray-800">{selecionado.garantia_status || '—'}</p>
            </div>
          </div>
          {selecionado.relato_entrada && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-400 text-sm mb-1">Relato de entrada</p>
              <p className="text-gray-700 text-sm">{selecionado.relato_entrada}</p>
            </div>
          )}
        </div>

        {/* Intervenções resumidas */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-3">
            Intervenções ({intervencoes.length})
          </h2>
          {intervencoes.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma intervenção registrada.</p>
          ) : (
            <div className="space-y-2">
              {intervencoes.map((r) => (
                <div key={r.id} className="flex items-start gap-3 text-sm">
                  <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium whitespace-nowrap">
                    {r.resposta}
                  </span>
                  <div>
                    <p className="text-gray-800">{r.checklist_itens?.componente || '—'}</p>
                    <p className="text-gray-400 text-xs">{r.checklist_itens?.secao || '—'}</p>
                    {r.observacao && (
                      <p className="text-gray-500 text-xs mt-1">{r.observacao}</p>
                    )}
                    {r.quantidade && (
                      <p className="text-gray-500 text-xs">Qtd: {r.quantidade}</p>
                    )}
                    {r.localizacao && (
                      <p className="text-gray-500 text-xs">Local: {r.localizacao}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Itens de execução - Peças */}
        {pecas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3">Peças ({pecas.length})</h2>
            <div className="space-y-3">
              {pecas.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-gray-800 font-medium text-sm">{item.descricao}</p>
                      {item.codigo_peca && (
                        <p className="text-gray-400 text-xs">Código: {item.codigo_peca}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(item.id, 'quantidade', e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.01"
                    />
                    <span className="text-gray-400 text-sm py-1">{item.unidade}</span>
                    <input
                      type="text"
                      value={item.observacao || ''}
                      onChange={(e) => atualizarItem(item.id, 'observacao', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Observação..."
                    />
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
              {servicos.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-gray-800 font-medium text-sm mb-2">{item.descricao}</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(item.id, 'quantidade', e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.01"
                    />
                    <span className="text-gray-400 text-sm py-1">{item.unidade}</span>
                    <input
                      type="text"
                      value={item.observacao || ''}
                      onChange={(e) => atualizarItem(item.id, 'observacao', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Observação..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist completo recolhido */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <button
            onClick={() => setMostrarChecklist(!mostrarChecklist)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="font-bold text-gray-800">
              Checklist Completo ({respostas.length} respostas)
            </h2>
            <span className="text-gray-400">{mostrarChecklist ? '▲' : '▼'}</span>
          </button>
          {mostrarChecklist && (
            <div className="mt-4 space-y-2">
              {respostas.map((r) => (
                <div key={r.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                    r.resposta === 'OK' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {r.resposta}
                  </span>
                  <div>
                    <p className="text-gray-700">{r.checklist_itens?.componente || '—'}</p>
                    <p className="text-gray-400 text-xs">{r.checklist_itens?.secao || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {erro && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{erro}</div>
        )}

        {/* Ações do gestor */}
        {!showDevolucao ? (
          <div className="flex gap-3">
            <button
              onClick={() => setShowDevolucao(true)}
              disabled={processando}
              className="flex-1 py-3 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50"
            >
              Devolver ao Técnico
            </button>
            <button
              onClick={aprovar}
              disabled={processando}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {processando ? 'Processando...' : 'Aprovar Diagnóstico'}
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
              placeholder="Descreva o motivo da devolução ao técnico..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDevolucao(false); setMotivoDevolucao('') }}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={devolver}
                disabled={processando || !motivoDevolucao}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {processando ? 'Devolvendo...' : 'Confirmar Devolução'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
