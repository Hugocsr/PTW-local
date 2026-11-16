import { describe, expect, it } from "vitest"
import { PTW_MESSAGE, toastFor } from "./ptwErrors"

describe("mensagem de recusa", () => {
  it("reserva fora do ar para indisponibilidade", () => {
    for (const code of ["sem_servidor", "PTA01"] as const) {
      expect(toastFor({ code, message: "O servidor não respondeu" }).title).toBe("Servidor fora do ar")
    }
  })
  it("não confunde permissão, versão desatualizada ou erro interno com indisponibilidade", () => {
    for (const code of ["PTA03", "PTA06", "PTA99"] as const) {
      expect(toastFor({ code, message: "Motivo informado pelo servidor" })).toEqual({ title: "Não foi possível concluir", description: "Motivo informado pelo servidor" })
    }
  })
  it("mantém o motivo da regra e esconde ids técnicos do detalhe", () => {
    expect(toastFor({ code: "PTW10", message: "Equipamento ocupado", detail: "019a0010-0000-7000-8000-000000000002" })).toEqual({ title: PTW_MESSAGE.PTW10, description: "Equipamento ocupado" })
  })
})
