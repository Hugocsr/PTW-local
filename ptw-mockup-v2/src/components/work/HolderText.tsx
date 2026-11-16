import { Fragment } from "react"

export interface HolderLink { id: string; number: string }

/**
 * A check or reason sentence with the number of the PT that holds the equipment as a link to it
 * (`#pt/<id>`). Text without a holder number renders as is.
 */
export function HolderText({ text, holders = [] }: { text: string; holders?: HolderLink[] }) {
  const found = holders.filter((h) => text.includes(h.number))
  if (!found.length) return <>{text}</>
  const re = new RegExp(`(${found.map((h) => h.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`)
  return (
    <>
      {text.split(re).map((part, i) => {
        const h = found.find((x) => x.number === part)
        return h ? (
          // Inline link; the pseudo-element gives it a 44 px tap area on touch.
          <a key={i} href={`#pt/${h.id}`}
            className="relative font-medium whitespace-nowrap underline underline-offset-2 hover:no-underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring max-md:after:absolute max-md:after:-inset-y-3 max-md:after:inset-x-0">
            {part}
          </a>
        ) : <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
