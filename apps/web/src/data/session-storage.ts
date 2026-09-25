/** Le SDK stocke ses jetons, jamais les mots de passe. Repli en mémoire si le stockage est bloqué. */
export function createSessionStorage() {
  const memory = new Map<string, string>()
  let persistent = true
  return {
    get persistent() {
      return persistent
    },
    getItem(key: string) {
      try {
        if (persistent) {
          const value = localStorage.getItem(key)
          if (value) memory.set(key, value)
          else memory.delete(key)
          return value
        }
      } catch {
        persistent = false
      }
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
      try {
        if (persistent) localStorage.setItem(key, value)
      } catch {
        persistent = false
      }
    },
    removeItem(key: string) {
      memory.delete(key)
      try {
        localStorage.removeItem(key)
      } catch {
        persistent = false
      }
    },
  }
}
