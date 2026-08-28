import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  atendimentoId: string
  onBack: () => void
}

interface ChecklistItem {
  id: string
  secao: string
  componente: string
  tipo_entrada: string
  opcoes: string[]
  requer_observacao_acao: boolean
  aceita_quantidade: boolean
  requer_localizacao: boolean
  detalhe_quando: string | null
  detalhe_rotulo: string | null
  detalhe_opcoes: string[] | null
  quantidade_fixa: number | null
  quantidade_pos_execucao: boolean
  usar_carga_padrao_modelo: boolean
  codigo_peca: string | null
  unidade_quantidade: string | null
  modelo: string | null
  tipo_servico: string | null
}

interface Resposta {
  resposta: string
  observacao: string
  quantidade: string
  localizacao: string
  detalhe: string
}

interface Atendimento {
  id: string
  numero: number
  status: string
  tipo_servico: string
  garantia_status: string
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string; numero_serie: string } | null
  modelos_equipamentos: { nome: string; categoria: string } | null
}

export default function Checklist({ atendimentoId, onBack }: Props) {
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null)
  const [itens, setItens] = useState<ChecklistItem[]>([])
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [secaoAtual, setSecaoAtual] = useState(0)
  const [secoes, setSecoes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)

    const { data: atend } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_servico, garantia_status,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('id', atendimentoId)
      .single()

    if (atend) setAtendimento(atend as unknown as Atendimento)

    const { data: itensData } = await supabase
      .from('checklist_itens')
      .select('*')
      .eq('ativo', true)
      .order('secao')
      .order('componente')

    if (itensData) {
      const modeloNome = (atend as any)?.equipamentos?.modelo
      const tipoServico = (atend as any)?.tipo_servico

      const filtrados = itensData.filter((item: ChecklistItem) => {
        if (item.modelo && item.tipo_servico) {
          return item.modelo === modeloNome && item.tipo_servico === tipoServico
        }
        if (item.modelo) {
          return item.modelo === modeloNome
        }
        return !item.modelo && !item.tipo_servico
      })

      setItens(filtrados)

      const secs = [...new Set(filtrados.map((i) => i.secao))]
      setSecoes(secs)

      const { data: respData } = await supabase
        .from('checklist_respostas')
        .select('*')
        .eq('atendimento_id', atendimentoId)

      const respMap: Record<string, Resposta> = {}
      if (respData) {
        respData.forEach((r: any) => {
          respMap[r.checklist_item_id] = {
            resposta: r.resposta || '',
            observacao: r.observacao || '',
            quantidade: r.quantidade?.toString() || '',
            localizacao: r.localizacao || '',
            detalhe: r.detalhe || '',
          }
        })
      }
      setRespostas(respMap)

      const primeiraIncompleta = secs.findIndex((sec) => {
        const itensSecao = filtrados.filter((i) => i.secao === sec)
        return itensSecao.some((i) => !respMap[i.id]?.resposta)
      })
      setSecaoAtual(primeiraIncompleta >= 0 ? primeiraIncompleta : 0)
    }

    setLoading(false)
  }

  function atualizarResposta(itemId: string, campo: keyof Resposta, valor: string) {
    setRespostas((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [campo]: valor,
      },
    }))
  }

  async function salvarSecao() {
    setSalvando(true)
    setErro('')

    const itensSecao = itens.filter((i) => i.secao === secoes[secaoAtual])

    for (const item of itensSecao) {
      const resp = respostas[item.id]
      if (!resp?.resposta) continue

      const payload = {
        atendimento_id: atendimentoId,
        checklist_item_id: item.id,
        resposta: resp.resposta,
        observacao: resp.observacao || null,
        quantidade: resp.quantidade ? parseFloat(resp.quantidade) : null,
        localizacao: resp.localizacao || null,
        detalhe: resp.detalhe || null,
      }

      const { data: existente } = await supabase
        .from('checklist_respostas')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .eq('checklist_item_id', item.id)
        .single()

      if (existente) {
        await supabase
          .from('checklist_respostas')
          .update(payload)
          .eq('id', existente.id)
      } else {
        await supabase
          .from('checklist_respostas')
          .insert({ ...payload, respondido_por: (await supabase.auth.getUser()).data.user?.id })
      }
    }

    setSalvando(false)
  }

  async function enviarDiagnostico() {
    setEnviando(true)
    setErro('')

    await salvarSecao()

    const itensIntervencao = itens.filter((item) => {
      const resp = respostas[item.id]
      return resp?.resposta && resp.resposta !== 'OK'
    })

    for (const item of itensIntervencao) {
      const resp = respostas[item.id]
      const tipo = item.codigo_peca ? 'PECA' : 'SERVICO'

      const payload = {
        atendimento_id: atendimentoId,
        checklist_item_id: item.id,
        descricao: item.componente,
        quantidade: resp.quantidade ? parseFloat(resp.quantidade) : (item.quantidade_fixa || 1),
        unidade: item.unidade_quantidade || (tipo === 'PECA' ? 'UN' : 'H'),
        tipo,
        observacao: resp.observacao || null,
        codigo_peca: item.codigo_peca || null,
      }

      const { data: existente } = await supabase
        .from('itens_execucao')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .eq('checklist_item_id', item.id)
        .single()

      if (existente) {
        await supabase
          .from('itens_execucao')
          .update(payload)
          .eq('id', existente.id)
      } else {
        await supabase
          .from('itens_execucao')
          .insert(payload)
      }
    }

    const { error: errStatus } = await supabase
      .from('atendimentos')
      .update({ status: 'AGUARDANDO_VALIDACAO_GESTOR' })
      .eq('id', atendimentoId)

    if (errStatus) {
      setErro('Erro ao enviar diagnóstico')
      setEnviando(false)
      return
    }

    setEnviando(false)
    onBack()
  }

  function secaoCompleta(secIdx: number): boolean {
    const itensSecao = itens.filter((i) => i.secao === secoes[secIdx])
    return itensSecao.every((i) => respostas[i.id]?.resposta)
  }

  function progressoSecao(): number {
    const itensSecao = itens.filter((i) => i.secao === secoes[secaoAtual])
    if (itensSecao.length === 0) return 0
    const respondidos = itensSecao.filter((i) => respostas[i.id]?.resposta).length
    return Math.round((respondidos / itensSecao.length) * 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando checklist...</div>
      </div>
    )
  }

  const itensSecao = itens.filter((i) => i.secao === secoes[secaoAtual])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="text-blue-200 hover:text-white">
            ← Voltar
          </button>
          <h1 className="text-lg font-bold">Checklist Técnico</h1>
        </div>
        {atendimento && (
          <div className="text-sm text-blue-200">
            #{atendimento.numero} • {atendimento.clientes?.razao_social || '—'} •{' '}
            {atendimento.veiculos?.placa_traseira || '—'} •{' '}
            {atendimento.equipamentos?.modelo || '—'}
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {secoes.map((sec, i) => (
            <button
              key={sec}
              onClick={() => setSecaoAtual(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                i === secaoAtual
                  ? 'bg-blue-600 text-white'
                  : secaoCompleta(i)
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {secaoCompleta(i) ? '✓ ' : ''}{sec}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>Progresso da seção</span>
            <span>{progressoSecao()}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progressoSecao()}%` }}
            />
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-800 mb-4">{secoes[secaoAtual]}</h2>

        <div className="space-y-4">
          {itensSecao.map((item) => {
            const resp = respostas[item.id] || { resposta: '', observacao: '', quantidade: '', localizacao: '', detalhe: '' }

            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-medium text-gray-800 mb-3">{item.componente}</h3>

                <div className="flex flex-wrap gap-2 mb-3">
                  {item.opcoes.map((op) => (
                    <button
                      key={op}
                      onClick={() => atualizarResposta(item.id, 'resposta', op)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                        resp.resposta === op
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>

                {resp.resposta && resp.resposta !== 'OK' && (
                  <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
                    {item.requer_observacao_acao && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Observação
                        </label>
                        <input
                          type="text"
                          value={resp.observacao}
                          onChange={(e) => atualizarResposta(item.id, 'observacao', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Descreva a intervenção..."
                        />
                      </div>
                    )}

                    {item.aceita_quantidade && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Quantidade {item.unidade_quantidade ? `(${item.unidade_quantidade})` : ''}
                        </label>
                        <input
                          type="number"
                          value={resp.quantidade}
                          onChange={(e) => atualizarResposta(item.id, 'quantidade', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="0"
                          disabled={item.quantidade_pos_execucao}
                        />
                        {item.quantidade_pos_execucao && (
                          <p className="text-xs text-orange-600 mt-1">
                            Quantidade definida após execução
                          </p>
                        )}
                      </div>
                    )}

                    {item.requer_localizacao && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Localização
                        </label>
                        <select
                          value={resp.localizacao}
                          onChange={(e) => atualizarResposta(item.id, 'localizacao', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">Selecione...</option>
                          <option value="EVAPORADOR">Evaporador</option>
                          <option value="CONDENSADOR">Condensador</option>
                        </select>
                      </div>
                    )}

                    {item.detalhe_quando && resp.resposta === item.detalhe_quando && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {item.detalhe_rotulo || 'Detalhe'}
                        </label>
                        {item.detalhe_opcoes && item.detalhe_opcoes.length > 0 ? (
                          <select
                            value={resp.detalhe}
                            onChange={(e) => atualizarResposta(item.id, 'detalhe', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Selecione...</option>
                            {item.detalhe_opcoes.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={resp.detalhe}
                            onChange={(e) => atualizarResposta(item.id, 'detalhe', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        )}
                      </div>
                    )}

                    {item.codigo_peca && (
                      <div className="text-xs text-gray-400">
                        Código: {item.codigo_peca}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {erro && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mt-4">{erro}</div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setSecaoAtual(Math.max(0, secaoAtual - 1))}
            disabled={secaoAtual === 0}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={salvarSecao}
            disabled={salvando}
            className="flex-1 py-3 border border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar Seção'}
          </button>
          {secaoAtual < secoes.length - 1 ? (
            <button
              onClick={() => setSecaoAtual(secaoAtual + 1)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Próxima
            </button>
          ) : (
            <button
              onClick={enviarDiagnostico}
              disabled={enviando}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Enviar Diagnóstico'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
