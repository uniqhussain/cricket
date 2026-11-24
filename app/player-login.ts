const loginDomain = '@players.cricket.invalid'
export const playerUsername = /^[a-z0-9][a-z0-9._-]{2,39}$/
export const minPlayerPasswordLength = 8
export const minAdminPasswordLength = 12

export function loginIdentifier(value: string) {
  const login = value.trim().toLowerCase()
  if (login.includes('@')) return { email: login }
  if (/^\+\d{7,15}$/.test(login)) return { phone: login }
  return { email: login + loginDomain }
}
