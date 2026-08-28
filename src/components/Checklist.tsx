import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { AcaoChecklist, ChecklistResposta } from '../types'
import { ACOES_GERAM_PECA, ACOES_GERAM_SERVICO, ACOES_GERAM_MATERIAL } from '../types'

interface Props {
  atendimentoId: string
  onBack: () => void
  onComplete: () => void
}

interface ChecklistItem {
  id: string
  secao: string
  componente: string
  opcoes: string[]
  requer_condicao: boolean
  requer_diagnostico: boolean
  requer_observacao: boolean
  aceita_quantidade: boolean
  requer_localizacao: boolean
  quantidade_pos_execucao: boolean
  unidade_quantidade: string | null
  codigo_peca: string | null
  codigo_servico: string | null
  tempo_padrao: number | null
  modelo: string | null
  tipo_atendimento: string | null
  subtipo_revisao: string | null
}

interface Atendimento {
  id: string
  numero: number
  status: string
  tipo_atendimento: string
  subtipo_revisao: string | null
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string; numero_serie: string } | null
}

interface PecaCatalogo {
  id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_padrao: number
}

interface ServicoCatalogo {
  id: string
  codigo_servico: string
  descricao: string
  tempo_padrao: number | null
  unidade: string
}

export default function Checklist({ atendimentoId, onBack, onComplete }: Props) {
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null)
  const [itens, setItens] = useState<ChecklistItem[]>([])
  const [respostas, setRespostas] = useState<Record<string, ChecklistResposta>>({})
  const [secaoAtual, setSecaoAtual] = useState(0)
  const [secoes, setSecoes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarPesquisaLivre, setMostrarPesquisaLivre] = useState(false)
  const [buscaPeca, setBuscaPeca] = useState('')
  const [resultadosPeca, setResultadosPeca] = useState<PecaCatalogo[]>([])
  const [buscaServico, setBuscaServico] = useState('')
  const [resultadosServico, setResultadosServico] = useState<ServicoCatalogo[]>([])
  const [pecasManuais, setPecasManuais] = useState<any[]>([])
  const [servicosManuais, setServicosManuais] = useState<any[]>([])

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)

    const { data: atend } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_atendimento, subtipo_revisao,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('id', atendimentoId)
      .single()

    if (atend) setAtendimento(atend as unknown as Atendimento)

    const modeloNome = (atend as any)?.equipamentos?.modelo
    const tipoAtend = (atend as any)?.tipo_atendimento
    const subtipo = (atend as any)?.subtipo_revisao

    const { data: itensData } = await supabase
      .from('checklist_itens')
      .select('*')
      .eq('ativo', true)
      .order('secao')
      .order('componente')

    if (itensData) {
      const filtrados = itensData.filter((item: ChecklistItem) => {
        if (item.modelo && item.subtipo_revisao) {
          return item.modelo === modeloNome && item.subtipo_revisao === subtipo
        }
        if (item.modelo) {
          return item.modelo === modeloNome
        }
        if (item.tipo_atendimento && item.tipo_atendimento === tipoAtend) {
          return true
        }
        return !item.modelo && !item.tipo_atendimento && !item.subtipo_revisao
      })

      setItens(filtrados)
      const secs = [...new Set(filtrados.map((i) => i.secao))]
      setSecoes(secs)

      const { data: respData } = await supabase
        .from('checklist_respostas')
        .select('*')
        .eq('atendimento_id', atendimentoId)

      const respMap: Record<string, ChecklistResposta> = {}
      if (respData) {
        respData.forEach((r: any) => {
          respMap[r.checklist_item_id] = {
            condicao: r.condicao || '',
            diagnostico: r.diagnostico || '',
            acao: r.acao || '',
            observacao: r.observacao || '',
            quantidade: r.quantidade?.toString() || '',
            localizacao: r.localizacao || '',
          }
        })
      }
      setRespostas(respMap)

      const primeiraIncompleta = secs.findIndex((sec) => {
        const itensSecao = filtrados.filter((i) => i.secao === sec)
        return itensSecao.some((i) => !respMap[i.id]?.acao)
      })
      setSecaoAtual(primeiraIncompleta >= 0 ? primeiraIncompleta : 0)
    }

    const { data: pecasManuaisData } = await supabase
      .from('atendimento_pecas')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .eq('origem', 'MANUAL')

    if (pecasManuaisData) setPecasManuais(pecasManuaisData)

    const { data: servicosManuaisData } = await supabase
      .from('atendimento_servicos')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .eq('origem', 'MANUAL')

    if (servicosManuaisData) setServicosManuais(servicosManuaisData)

    setLoading(false)
  }

  function atualizarResposta(itemId: string, campo: keyof ChecklistResposta, valor: string) {
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
    const userId = (await supabase.auth.getUser()).data.user?.id

    for (const item of itensSecao) {
      const resp = respostas[item.id]
      if (!resp?.acao) continue

      const payload = {
        atendimento_id: atendimentoId,
        checklist_item_id: item.id,
        condicao: resp.condicao || null,
        diagnostico: resp.diagnostico || null,
        acao: resp.acao,
        observacao: resp.observacao || null,
        quantidade: resp.quantidade ? parseFloat(resp.quantidade) : null,
        localizacao: resp.localizacao || null,
        respondido_por: userId,
      }

      const { data: existente } = await supabase
        .from('checklist_respostas')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .eq('checklist_item_id', item.id)
        .single()

      if (existente) {
        await supabase.from('checklist_respostas').update(payload).eq('id', existente.id)
      } else {
        await supabase.from('checklist_respostas').insert(payload)
      }
    }

    setSalvando(false)
  }

  async function buscarPecas(termo: string) {
    if (termo.length < 3) { setResultadosPeca([]); return }
    const { data } = await supabase
      .from('catalogo_pecas')
      .select('id, codigo, descricao, unidade, quantidade_padrao')
      .or(`codigo.ilike.%${termo}%,descricao.ilike.%${termo}%`)
      .eq('ativo', true)
      .limit(10)
    if (data) setResultadosPeca(data)
  }

  async function buscarServicos(termo: string) {
    if (termo.length < 3) { setResultadosServico([]); return }
    const { data } = await supabase
      .from('catalogo_servicos')
      .select('id, codigo_servico, descricao, tempo_padrao, unidade')
      .or(`codigo_servico.ilike.%${termo}%,descricao.ilike.%${termo}%`)
      .eq('ativo', true)
      .limit(10)
    if (data) setResultadosServico(data)
  }

  async function adicionarPecaManual(peca: PecaCatalogo) {
    const { data } = await supabase
      .from('atendimento_pecas')
      .insert({
        atendimento_id: atendimentoId,
        codigo: peca.codigo,
        descricao: peca.descricao,
        quantidade: peca.quantidade_padrao || 1,
        unidade: peca.unidade || 'UN',
        origem: 'MANUAL',
      })
      .select('*')
      .single()

    if (data) {
      setPecasManuais([...pecasManuais, data])
      setBuscaPeca('')
      setResultadosPeca([])
    }
  }

  async function adicionarServicoManual(servico: ServicoCatalogo) {
    const { data } = await supabase
      .from('atendimento_servicos')
      .insert({
        atendimento_id: atendimentoId,
        codigo: servico.codigo_servico,
        descricao: servico.descricao,
        tempo_padrao: servico.tempo_padrao,
        quantidade: 1,
        unidade: servico.unidade || 'h',
        origem: 'MANUAL',
      })
      .select('*')
      .single()

    if (data) {
      setServicosManuais([...servicosManuais, data])
      setBuscaServico('')
      setResultadosServico([])
    }
  }

  async function removerPecaManual(id: string) {
    await supabase.from('atendimento_pecas').delete().eq('id', id)
    setPecasManuais(pecasManuais.filter((p) => p.id !== id))
  }

  async function removerServicoManual(id: string) {
    await supabase.from('atendimento_servicos').delete().eq('id', id)
    setServicosManuais(servicosManuais.filter((s) => s.id !== id))
  }

  async function enviarDiagnostico() {
    setEnviando(true)
    setErro('')

    await salvarSecao()

    const itensComAcao = itens.filter((item) => {
      const resp = respostas[item.id]
      return resp?.acao && resp.acao !== 'OK' && resp.acao !== 'N/A'
    })

    for (const item of itensComAcao) {
      const resp = respostas[item.id]
      const acao = resp.acao as AcaoChecklist

      if (ACOES_GERAM_PECA.includes(acao) && item.codigo_peca) {
        const { data: pecaCat } = await supabase
          .from('catalogo_pecas')
          .select('id, codigo, descricao, unidade, quantidade_padrao')
          .eq('codigo', item.codigo_peca)
          .eq('modelo', atendimento?.equipamentos?.modelo)
          .single()

        if (pecaCat) {
          const { data: existente } = await supabase
            .from('atendimento_pecas')
            .select('id')
            .eq('atendimento_id', atendimentoId)
            .eq('checklist_item_id', item.id)
            .single()

          const payload = {
            atendimento_id: atendimentoId,
            checklist_item_id: item.id,
            codigo: pecaCat.codigo,
            descricao: pecaCat.descricao,
            quantidade: resp.quantidade ? parseFloat(resp.quantidade) : pecaCat.quantidade_padrao || 1,
            unidade: pecaCat.unidade || 'UN',
            observacao: resp.observacao || null,
            origem: 'CHECKLIST',
          }

          if (existente) {
            await supabase.from('atendimento_pecas').update(payload).eq('id', existente.id)
          } else {
            await supabase.from('atendimento_pecas').insert(payload)
          }
        }
      }

      if (ACOES_GERAM_SERVICO.includes(acao)) {
        let servicoCodigo = item.codigo_servico
        let servicoDesc = item.componente
        let tempoPadrao = item.tempo_padrao

        if (servicoCodigo) {
          const { data: servCat } = await supabase
            .from('catalogo_servicos')
            .select('id, codigo_servico, descricao, tempo_padrao, unidade')
            .eq('codigo_servico', servicoCodigo)
            .eq('modelo', atendimento?.equipamentos?.modelo)
            .single()

          if (servCat) {
            servicoDesc = servCat.descricao
            tempoPadrao = servCat.tempo_padrao
          }
        }

        const acaoLabel = acao.charAt(0).toUpperCase() + acao.slice(1).toLowerCase()
        const descFinal = `${acaoLabel} - ${servicoDesc}`

        const { data: existente } = await supabase
          .from('atendimento_servicos')
          .select('id')
          .eq('atendimento_id', atendimentoId)
          .eq('checklist_item_id', item.id)
          .single()

        const payload = {
          atendimento_id: atendimentoId,
          checklist_item_id: item.id,
          codigo: servicoCodigo || '',
          descricao: descFinal,
          tempo_padrao: tempoPadrao,
          quantidade: 1,
          unidade: 'h',
          observacao: resp.observacao || null,
          origem: 'CHECKLIST',
        }

        if (existente) {
          await supabase.from('atendimento_servicos').update(payload).eq('id', existente.id)
        } else {
          await supabase.from('atendimento_servicos').insert(payload)
        }
      }

      if (ACOES_GERAM_MATERIAL.includes(acao) && resp.quantidade) {
        const { data: existente } = await supabase
          .from('atendimento_pecas')
          .select('id')
          .eq('atendimento_id', atendimentoId)
          .eq('checklist_item_id', item.id)
          .single()

        const payload = {
          atendimento_id: atendimentoId,
          checklist_item_id: item.id,
          codigo: item.codigo_peca || '',
          descricao: item.componente,
          quantidade: parseFloat(resp.quantidade),
          unidade: item.unidade_quantidade || 'UN',
          observacao: resp.observacao || null,
          origem: 'CHECKLIST',
        }

        if (existente) {
          await supabase.from('atendimento_pecas').update(payload).eq('id', existente.id)
        } else {
          await supabase.from('atendimento_pecas').insert(payload)
        }
      }
    }

    await supabase.from('historico_status').insert({
      atendimento_id: atendimentoId,
      status_anterior: atendimento?.status || 'EM_DIAGNOSTICO',
      status_novo: 'AGUARDANDO_VALIDACAO_GESTOR',
      observacao: 'Diagnóstico enviado pelo técnico',
    })

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
    onComplete()
  }

  function secaoCompleta(secIdx: number): boolean {
    const itensSecao = itens.filter((i) => i.secao === secoes[secIdx])
    return itensSecao.every((i) => respostas[i.id]?.acao)
  }

  function progressoSecao(): number {
    const itensSecao = itens.filter((i) => i.secao === secoes[secaoAtual])
    if (itensSecao.length === 0) return 0
    const respondidos = itensSecao.filter((i) => respostas[i.id]?.acao).length
    return Math.round((respondidos / itensSecao.length) * 100)
  }

  const isCorretiva = atendimento?.subtipo_revisao === 'CORRETIVA'
  const isServicoComum = atendimento?.tipo_atendimento === 'SERVICO_COMUM'

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
          <button onClick={onBack} className="text-blue-200 hover:text-white">← Voltar</button>
          <h1 className="text-lg font-bold">Checklist Técnico</h1>
        </div>
        {atendimento && (
          <div className="text-sm text-blue-200">
            #{atendimento.numero} • {atendimento.clientes?.razao_social || '—'} •{' '}
            {atendimento.veiculos?.placa_traseira || '—'} • {atendimento.equipamentos?.modelo || '—'}
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
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressoSecao()}%` }} />
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-800 mb-4">{secoes[secaoAtual]}</h2>

        <div className="space-y-4">
          {itensSecao.map((item) => {
            const resp = respostas[item.id] || { condicao: '', diagnostico: '', acao: '', observacao: '', quantidade: '', localizacao: '' }
            const temAcao = resp.acao && resp.acao !== 'OK' && resp.acao !== 'N/A'

            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-medium text-gray-800 mb-3">{item.componente}</h3>

                <div className="flex flex-wrap gap-2 mb-3">
                  {item.opcoes.map((op) => (
                    <button
                      key={op}
                      onClick={() => atualizarResposta(item.id, 'acao', op)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                        resp.acao === op
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>

                {temAcao && (
                  <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
                    {item.requer_condicao && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Condição encontrada</label>
                        <input
                          type="text"
                          value={resp.condicao}
                          onChange={(e) => atualizarResposta(item.id, 'condicao', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Ex: Suja, desgastada, com vazamento..."
                        />
                      </div>
                    )}

                    {item.requer_diagnostico && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Diagnóstico / Causa</label>
                        <input
                          type="text"
                          value={resp.diagnostico}
                          onChange={(e) => atualizarResposta(item.id, 'diagnostico', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Ex: Peneira obstruída, rolamento danificado..."
                        />
                      </div>
                    )}

                    {item.requer_observacao && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Observação técnica</label>
                        <textarea
                          value={resp.observacao}
                          onChange={(e) => atualizarResposta(item.id, 'observacao', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Observações adicionais..."
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
                          <p className="text-xs text-orange-600 mt-1">Quantidade definida após execução</p>
                        )}
                      </div>
                    )}

                    {item.requer_localizacao && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Localização</label>
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

                    {item.codigo_peca && ACOES_GERAM_PECA.includes(resp.acao as AcaoChecklist) && (
                      <div className="text-xs text-gray-400">Peça vinculada: {item.codigo_peca}</div>
                    )}
                    {item.codigo_servico && ACOES_GERAM_SERVICO.includes(resp.acao as AcaoChecklist) && (
                      <div className="text-xs text-gray-400">
                        Serviço: {item.codigo_servico} {item.tempo_padrao ? `(${item.tempo_padrao}h)` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {(isCorretiva || isServicoComum) && (
          <div className="mt-6">
            <button
              onClick={() => setMostrarPesquisaLivre(!mostrarPesquisaLivre)}
              className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg font-medium hover:bg-blue-50"
            >
              {mostrarPesquisaLivre ? '▲ Fechar pesquisa livre' : '+ Pesquisa livre (peças e serviços)'}
            </button>

            {mostrarPesquisaLivre && (
              <div className="mt-4 space-y-4">
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Buscar peça</h3>
                  <input
                    type="text"
                    value={buscaPeca}
                    onChange={(e) => { setBuscaPeca(e.target.value); buscarPecas(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                    placeholder="Digite código ou descrição (mín. 3 caracteres)..."
                  />
                  {resultadosPeca.length > 0 && (
                    <div className="space-y-2">
                      {resultadosPeca.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => adicionarPecaManual(p)}
                          className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50"
                        >
                          <p className="text-sm font-medium text-gray-800">{p.codigo} - {p.descricao}</p>
                          <p className="text-xs text-gray-400">Un: {p.unidade} • Qtd padrão: {p.quantidade_padrao}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {pecasManuais.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">Peças adicionadas:</p>
                      {pecasManuais.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div className="text-sm">
                            <p className="text-gray-800">{p.codigo} - {p.descricao}</p>
                            <p className="text-xs text-gray-400">{p.quantidade} {p.unidade}</p>
                          </div>
                          <button onClick={() => removerPecaManual(p.id)} className="text-red-500 text-xs">Remover</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Buscar serviço</h3>
                  <input
                    type="text"
                    value={buscaServico}
                    onChange={(e) => { setBuscaServico(e.target.value); buscarServicos(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                    placeholder="Digite código ou descrição (mín. 3 caracteres)..."
                  />
                  {resultadosServico.length > 0 && (
                    <div className="space-y-2">
                      {resultadosServico.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => adicionarServicoManual(s)}
                          className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50"
                        >
                          <p className="text-sm font-medium text-gray-800">{s.codigo_servico} - {s.descricao}</p>
                          <p className="text-xs text-gray-400">Tempo: {s.tempo_padrao || '—'} {s.unidade}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {servicosManuais.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">Serviços adicionados:</p>
                      {servicosManuais.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div className="text-sm">
                            <p className="text-gray-800">{s.codigo} - {s.descricao}</p>
                            <p className="text-xs text-gray-400">{s.tempo_padrao || '—'} {s.unidade}</p>
                          </div>
                          <button onClick={() => removerServicoManual(s.id)} className="text-red-500 text-xs">Remover</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {erro && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mt-4">{erro}</div>}

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
