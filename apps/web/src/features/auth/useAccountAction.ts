import { useRef, useState } from 'react'
import { formError } from './auth-errors'

export function useAccountAction() {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  async function run(action: () => Promise<string | void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      setMessage((await action()) || '')
    } catch (error) {
      setFailed(true)
      setMessage(formError(error))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return { busy, message, failed, run }
}
