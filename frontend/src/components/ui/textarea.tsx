"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { inputVariants } from "./input"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the content instead of scrolling (turns manual resizing off). */
  autoResize?: boolean
}

/**
 * Multi-line text primitive (audit §4.8, DS-02, DS-10). Shares `Input`'s token
 * recipe and `aria-invalid` state, at least 5rem tall and vertically
 * resizable. Spread `Field`'s render-prop onto it:
 *
 *   <Field label={t('…notes')} optional>
 *     {(field) => <Textarea {...field} value={notes} onChange={…} />}
 *   </Field>
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, onInput, rows = 3, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    const resize = React.useCallback(() => {
      const node = innerRef.current
      if (!autoResize || !node) return
      node.style.height = "auto"
      node.style.height = `${node.scrollHeight}px`
    }, [autoResize])

    // Controlled values can change without an input event (form reset, load).
    React.useLayoutEffect(resize, [resize, props.value])

    return (
      <textarea
        ref={setRefs}
        rows={rows}
        className={cn(
          inputVariants({ size: null }),
          "min-h-20 px-4 py-2.5",
          autoResize ? "resize-none overflow-hidden" : "resize-y",
          className
        )}
        onInput={(event) => {
          resize()
          onInput?.(event)
        }}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
