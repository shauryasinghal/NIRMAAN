import { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, name, ...rest }, ref) => {
    const resolvedId = id ?? name
    return (
    <div className="w-full">
      {label && (
        <label htmlFor={resolvedId} className="block text-xs font-medium text-muted mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={resolvedId}
        name={name}
        className={clsx(
          'w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-ring',
          error ? 'border-danger-500' : 'border-[var(--border)]',
          className,
        )}
        {...rest}
      />
      {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
    </div>
    )
  },
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, name, ...rest }, ref) => {
    const resolvedId = id ?? name
    return (
    <div className="w-full">
      {label && (
        <label htmlFor={resolvedId} className="block text-xs font-medium text-muted mb-1.5">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={resolvedId}
        name={name}
        className={clsx(
          'w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-ring resize-none',
          error ? 'border-danger-500' : 'border-[var(--border)]',
          className,
        )}
        {...rest}
      />
      {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
    </div>
    )
  },
)
Textarea.displayName = 'Textarea'
