/** The editor of one form item (every kind). */
import { Fragment } from "react"
import { CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import { uuidv7 } from "@/lib/id"
import { DeferredText } from "../DeferredText"
import { Stepper, ToggleField } from "../common"
import { lineChoices, optionsOf } from "@/core/form"
import { PickList } from "../PickList"
import { SourceDisclosure } from "../origem"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AttachKind, CheckLine, FormItem } from "@/registry/types"
import { GroupColumns, ListEditor, NumberSettings, ShowWhen } from "./parts"
import type { SetTpl } from "./shared"
import { ANSWER_SETS, ATTACH, attachOrder, insertAt, newLine, patchItem, removedToast } from "./shared"

export function ItemEditor({ item, sources, onChange, onDuplicate, setTpl, column }: { item: FormItem; sources: FormItem[]; onChange: (i: FormItem) => void; onDuplicate?: () => void; setTpl: SetTpl; column?: boolean }) {
  const { optionLists: lists, roleTypes } = useRegistry().state
  const id = (s: string) => `${item.id}-${s}`
  return (
    <div className={cn("flex flex-col gap-4 border-t border-border/60 py-3", !column && "sm:pl-11")}>
      <SourceDisclosure id={item.id} />
      {item.kind === "aviso" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("text")}>Texto do aviso</Label>
          <DeferredText long id={id("text")} value={item.text} maxLength={200} onCommit={(text) => onChange({ ...item, text })} placeholder="Ex.: Esta PT só pode ser transferida com supervisão de uma pessoa autorizada." />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("label")}>Rótulo</Label>
            <DeferredText id={id("label")} value={item.label} onCommit={(label) => onChange({ ...item, label })} className="min-h-11 md:min-h-9" />
          </div>
          <ToggleField label="Obrigatório" checked={item.required} onChange={(v) => onChange({ ...item, required: v })} />
        </>
      )}

      {item.kind === "anexo" && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="type-field" id={id("acc")}>Aceita</span>
            <ToggleGroup type="multiple" variant="outline" spacing={0} value={item.accept} aria-labelledby={id("acc")} className="w-full sm:w-fit"
              onValueChange={(v) => v.length && onChange({ ...item, accept: attachOrder(v as AttachKind[]) })}>
              {(Object.keys(ATTACH) as AttachKind[]).map((k) => <ToggleGroupItem key={k} value={k} className="min-h-11 flex-1 px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9">{ATTACH[k]}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <Stepper label="Mínimo" value={item.min} onChange={(n) => onChange({ ...item, min: n })} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("hint")}>Instrução para quem captura</Label>
            <DeferredText id={id("hint")} value={item.hint} maxLength={160} onCommit={(hint) => onChange({ ...item, hint })} placeholder="Ex.: mostre o cadeado e a etiqueta no disjuntor" className="min-h-11 md:min-h-9" />
          </div>
        </>
      )}

      {item.kind === "numero" && <NumberSettings item={item} onChange={onChange} />}

      {item.kind === "horario" && <ToggleField label="Com segundos" checked={item.seconds} onChange={(v) => onChange({ ...item, seconds: v })} />}

      {item.kind === "texto" && <ToggleField label="Texto longo" checked={item.long} onChange={(v) => onChange({ ...item, long: v })} />}

      {item.kind === "marcacao" && (
        <>
          <ToggleField label="Permite várias opções" checked={item.multiple} onChange={(v) => onChange({ ...item, multiple: v })} />
          <ToggleField label="Permite “Outro: especificar”" checked={item.other} onChange={(v) => onChange({ ...item, other: v })} />
          <div className="flex flex-col gap-1.5">
            <span className="type-field" id={id("src")}>Opções</span>
            <ToggleGroup type="single" variant="outline" spacing={0} value={item.listId ? "lista" : "digitar"} aria-labelledby={id("src")} className="w-full sm:w-fit"
              onValueChange={(v) => {
                if (v === "lista" && !item.listId) onChange({ ...item, listId: lists[0]?.id, options: [], blockOptionIds: undefined })
                if (v === "digitar" && item.listId) onChange({ ...item, listId: undefined, blockOptionIds: undefined, options: [{ id: uuidv7(), label: "" }] })
              }}>
              <ToggleGroupItem value="digitar" className="min-h-11 flex-1 px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9">Digitar opções</ToggleGroupItem>
              <ToggleGroupItem value="lista" disabled={lists.length === 0} className="min-h-11 flex-1 px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9">Usar lista</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {item.listId ? (
            <div className="flex flex-col gap-2">
              <Select value={item.listId} onValueChange={(v) => onChange({ ...item, listId: v, blockOptionIds: undefined })}>
                <SelectTrigger className="min-h-11 w-full sm:w-64 md:min-h-9" aria-label="Lista de opções"><SelectValue placeholder="Lista" /></SelectTrigger>
                <SelectContent><SelectGroup>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <p className="type-meta">
                {(lists.find((l) => l.id === item.listId)?.items ?? []).filter((x) => x.active).map((x) => x.label).join(" · ") || "Lista vazia"}
              </p>
              <a href="#listas" className="type-meta w-fit underline underline-offset-2">Editar em Configuração › Listas</a>
              {/* Options that stop the stage, like a "Não" on a checklist line (e.g. "Classe 5", não forçável). */}
              <div className="flex flex-col gap-1.5">
                <span className="type-field" id={id("blk")}>Opções que impedem a etapa</span>
                <PickList ariaLabel="Opções que impedem a etapa" addLabel="Opção" empty="Nenhuma opção impede a etapa."
                  options={optionsOf(item, lists).map((o) => ({ id: o.id, label: o.label }))} value={item.blockOptionIds ?? []}
                  onChange={(ids) => onChange({ ...item, blockOptionIds: ids.length ? ids : undefined })} />
              </div>
            </div>
          ) : <ListEditor
            title="Opções digitadas"
            rows={item.options.map((o) => ({ id: o.id, label: o.label }))}
            extra={(rid) => {
              const o = item.options.find((x) => x.id === rid)!
              return <ToggleField small label="Impede a etapa" checked={o.blocks === true} onChange={(v) => onChange({ ...item, options: item.options.map((x) => (x.id === rid ? { id: x.id, label: x.label, ...(v ? { blocks: true } : {}) } : x)) })} />
            }}
            onRename={(rid, label) => onChange({ ...item, options: item.options.map((o) => (o.id === rid ? { ...o, label } : o)) })}
            onAdd={() => onChange({ ...item, options: [...item.options, { id: uuidv7(), label: "" }] })}
            onRemove={(rid) => {
              const k = item.options.findIndex((o) => o.id === rid)
              const opt = item.options[k]
              onChange({ ...item, options: item.options.filter((o) => o.id !== rid) })
              removedToast("Opção removida", opt.label.trim(), () => setTpl((cur) => patchItem(cur, item.id, (x) => (x.kind === "marcacao" ? { ...x, options: insertAt(x.options, k, opt) } : x))))
            }}
            addLabel="Opção"
          />}
        </>
      )}

      {item.kind === "verificacao" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("ans")}>Respostas</Label>
            <Select value={item.answers} onValueChange={(v) => {
              const answers = v as typeof item.answers
              // Changing the kind of answers resets what blocks or asks for a justification (the old values mean nothing in the new set).
              if (answers === "lista") onChange({ ...item, answers, answerListId: item.answerListId ?? lists[0]?.id, lines: item.lines.map((l) => ({ ...l, blockOn: [], noteOn: [] })) })
              else onChange({ ...item, answers, answerListId: undefined, lines: item.lines.map((l) => ({ ...l, blockOn: answers === "confirmo" || item.answers === "lista" ? [] : l.blockOn.filter((a) => a === "nao"), noteOn: answers === "sim_nao_na" && item.answers !== "lista" ? l.noteOn : [] })) })
            }}>
              <SelectTrigger id={id("ans")} className="min-h-11 w-full sm:w-64 md:min-h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{(Object.keys(ANSWER_SETS) as (keyof typeof ANSWER_SETS)[]).map((k) => <SelectItem key={k} value={k} disabled={k === "lista" && lists.length === 0}>{ANSWER_SETS[k]}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          {item.answers === "lista" && (
            <div className="flex flex-col gap-2">
              <Select value={item.answerListId ?? ""} onValueChange={(v) => onChange({ ...item, answerListId: v, lines: item.lines.map((l) => ({ ...l, blockOn: [], noteOn: [] })) })}>
                <SelectTrigger className="min-h-11 w-full sm:w-64 md:min-h-9" aria-label="Lista de respostas"><SelectValue placeholder="Lista" /></SelectTrigger>
                <SelectContent><SelectGroup>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <p className="type-meta">{lineChoices(item, lists).map((c) => c.label).join(" · ") || "Lista vazia"}</p>
              <a href="#listas" className="type-meta w-fit underline underline-offset-2">Editar em Configuração › Listas</a>
            </div>
          )}
          <ListEditor
            title="Linhas"
            rows={item.lines.map((l) => ({ id: l.id, label: l.label }))}
            onRename={(rid, label) => onChange({ ...item, lines: item.lines.map((l) => (l.id === rid ? { ...l, label } : l)) })}
            onAdd={() => onChange({ ...item, lines: [...item.lines, item.answers === "confirmo" || item.answers === "lista" ? { ...newLine(), blockOn: [], noteOn: [] } : item.answers === "sim_nao" ? { ...newLine(), noteOn: [] } : newLine()] })}
            onRemove={(rid) => {
              const k = item.lines.findIndex((l) => l.id === rid)
              const line = item.lines[k]
              onChange({ ...item, lines: item.lines.filter((l) => l.id !== rid) })
              removedToast("Linha removida", line.label.trim(), () => setTpl((cur) => patchItem(cur, item.id, (x) => (x.kind === "verificacao" ? { ...x, lines: insertAt(x.lines, k, line) } : x))))
            }}
            addLabel="Linha"
            extra={item.answers === "confirmo" ? undefined : (rid) => {
              const line = item.lines.find((l) => l.id === rid)!
              const patch = (p: Partial<CheckLine>) => onChange({ ...item, lines: item.lines.map((l) => (l.id === rid ? { ...l, ...p } : l)) })
              // List answers: each item of the list may stop the stage or ask for a justification (never both).
              if (item.answers === "lista") return (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {lineChoices(item, lists).map((c) => (
                    <Fragment key={c.id}>
                      <ToggleField small label={`“${c.label}” impede a etapa`} checked={line.blockOn.includes(c.id)}
                        onChange={(v) => patch({ blockOn: v ? [...line.blockOn, c.id] : line.blockOn.filter((a) => a !== c.id), noteOn: v ? line.noteOn.filter((a) => a !== c.id) : line.noteOn })} />
                      <ToggleField small label={`“${c.label}” exige justificativa`} checked={line.noteOn.includes(c.id)}
                        onChange={(v) => patch({ noteOn: v ? [...line.noteOn, c.id] : line.noteOn.filter((a) => a !== c.id), blockOn: v ? line.blockOn.filter((a) => a !== c.id) : line.blockOn })} />
                    </Fragment>
                  ))}
                </div>
              )
              return (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <ToggleField small label="“Não” impede a etapa" checked={line.blockOn.includes("nao")} onChange={(v) => patch({ blockOn: v ? ["nao"] : [] })} />
                  {item.answers === "sim_nao_na" && <ToggleField small label="“N/A” exige justificativa" checked={line.noteOn.includes("na")} onChange={(v) => patch({ noteOn: v ? ["na"] : [] })} />}
                </div>
              )
            }}
          />
        </>
      )}

      {item.kind === "data" && (
        <>
          <ToggleField label="Não aceita data antes de hoje" checked={item.notBeforeToday} onChange={(v) => onChange({ ...item, notBeforeToday: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("dmin")}>A partir de (opcional)</Label>
              <Input id={id("dmin")} type="date" value={item.min ?? ""} onChange={(e) => onChange({ ...item, min: e.target.value || undefined })} className="min-h-11 md:min-h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("dmax")}>Até (opcional)</Label>
              <Input id={id("dmax")} type="date" value={item.max ?? ""} aria-invalid={!!item.min && !!item.max && item.min > item.max} onChange={(e) => onChange({ ...item, max: e.target.value || undefined })} className="min-h-11 md:min-h-9" />
            </div>
          </div>
          <p className="type-meta">Uma data fora da regra impede a etapa.</p>
        </>
      )}

      {item.kind === "documento" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("pat")}>Formato do número (opcional)</Label>
            <DeferredText id={id("pat")} value={item.pattern ?? ""} maxLength={30} onCommit={(v) => { const { pattern: _p, ...rest } = item; void _p; onChange(v.trim() ? { ...rest, pattern: v.trim() } : rest) }} placeholder="Ex.: APR-####" className="min-h-11 sm:w-64 md:min-h-9" />
            <p className="type-meta"># = algarismo, A = letra; o resto é fixo.</p>
          </div>
          <ToggleField label="Pede o documento anexado" checked={item.attach} onChange={(v) => onChange({ ...item, attach: v })} />
          <ToggleField label="Pede a validade (vencido impede a etapa)" checked={item.validity} onChange={(v) => onChange({ ...item, validity: v })} />
        </>
      )}

      {item.kind === "pessoa" && (
        <>
          <ToggleField label="Permite várias pessoas" checked={item.multiple} onChange={(v) => onChange({ ...item, multiple: v })} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("role")}>Quem pode ser escolhido</Label>
            <Select value={item.roleId ?? "_todos"} onValueChange={(v) => onChange({ ...item, roleId: v === "_todos" ? undefined : v, mustBeEligible: v === "_todos" ? false : item.mustBeEligible })}>
              <SelectTrigger id={id("role")} className="min-h-11 w-full sm:w-64 md:min-h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="_todos">Qualquer pessoa do cadastro</SelectItem>
                {roleTypes.map((r) => <SelectItem key={r.id} value={r.id}>Quem tem o cargo {r.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <ToggleField label="Deve estar elegível hoje (cargo e conta válidos)" checked={item.mustBeEligible} disabled={!item.roleId} onChange={(v) => onChange({ ...item, mustBeEligible: v })} />
          {item.mustBeEligible && <p className="type-meta">Alguém não elegível impede a etapa.</p>}
        </>
      )}

      {item.kind === "isolamento" && (
        <>
          <Stepper label="Mínimo de pontos" value={item.minRows} min={0} onChange={(n) => onChange({ ...item, minRows: n })} />
          <p className="type-meta">Cada ponto pede: ponto ou tag (pode ser um ativo da PT), tipo de energia, método, nº do cadeado ou etiqueta, energia zero verificada e quem aplicou. “Energia zero: Não” impede a etapa.</p>
        </>
      )}

      {item.kind === "grupo" && <GroupColumns item={item} onChange={onChange} setTpl={setTpl} />}

      {!column && <ShowWhen item={item} sources={sources} lists={lists} onChange={onChange} />}

      {onDuplicate && <Button variant="ghost" className="min-h-11 w-fit md:min-h-9" onClick={onDuplicate}><CopyIcon data-icon="inline-start" />Duplicar</Button>}
    </div>
  )
}
