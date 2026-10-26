import nodemailer from 'nodemailer'

/** Envoi d'e-mails : actif uniquement si SMTP_HOST est configuré. */
export function createMailer(env = process.env) {
  if (!env.SMTP_HOST) return { enabled: false, send: async () => { throw new Error('SMTP non configuré') } }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })

  return {
    enabled: true,
    send: ({ to, subject, text }) => transport.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text }),
  }
}
