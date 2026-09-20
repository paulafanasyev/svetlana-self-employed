/**
 * Minimal SMTP client (implicit TLS on 465, or STARTTLS on 587).
 *
 * We intentionally avoid a bundled dependency: a small, correct SMTP handshake
 * over node:tls keeps the install offline-friendly. It supports the plain
 * commands we need (EHLO/STARTTLS/AUTH LOGIN/MAIL/RCPT/DATA).
 *
 * If SMTP_URL is not configured, sendDocumentEmail throws — callers must turn
 * that into an honest NOT_SENT, never a claim that mail was delivered (§14).
 */
import tls from 'node:tls';
import net from 'node:net';
import { config } from '../config.js';

class SmtpClient {
  constructor(url) {
    const u = new URL(url);
    this.host = u.hostname;
    this.secure = u.protocol === 'smtps:';
    this.port = Number(u.port || (this.secure ? 465 : 587));
    this.user = decodeURIComponent(u.username || '');
    this.pass = decodeURIComponent(u.password || '');
    this.sock = null;
    this.lines = [];
    this.waiter = null;
  }

  _attach() {
    this.sock.removeAllListeners('data');
    this.sock.on('data', (d) => {
      const text = d.toString('utf8');
      const parts = text.split('\r\n');
      const last = parts.pop();
      if (last !== '') {
        this._partial = (this._partial ?? '') + last;
      }
      for (const p of parts) {
        this.lines.push((this._partial ?? '') + p);
        this._partial = '';
      }
      this._pump();
    });
    this.sock.on('error', (err) => {
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w.reject(err);
      }
    });
  }

  _pump() {
    if (!this.waiter) return;
    const idx = this.lines.findIndex((l) => /^\d{3} /.test(l));
    if (idx === -1) return;
    const line = this.lines[idx];
    this.lines = this.lines.filter((_, i) => i !== idx);
    const w = this.waiter;
    this.waiter = null;
    w.resolve(line);
  }

  /** Wait for a reply whose code matches `expect` (e.g. 250). */
  async expect(code) {
    const line = await new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
      this._pump();
    });
    const got = Number(line.slice(0, 3));
    if (got !== code) throw new Error(`SMTP expected ${code}, got: ${line.trim()}`);
    return line;
  }

  async send(data) {
    await new Promise((resolve, reject) => {
      this.sock.write(data.endsWith('\r\n') ? data : `${data}\r\n`, (err) => (err ? reject(err) : resolve()));
    });
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.sock = this.secure
        ? tls.connect({ host: this.host, port: this.port, servername: this.host }, () => resolve())
        : net.connect({ host: this.host, port: this.port }, () => resolve());
      this.sock.once('error', reject);
    });
    this._attach();
    await this.expect(220);
    await this.send('EHLO mir-samozanyatyh');
    await this.expect(250);
    if (!this.secure) {
      await this.send('STARTTLS');
      await this.expect(220);
      const plain = this.sock;
      const secureSock = tls.connect({ socket: plain, servername: this.host, rejectUnauthorized: false });
      await new Promise((resolve, reject) => {
        secureSock.once('secureConnect', resolve);
        secureSock.once('error', reject);
      });
      this.sock = secureSock;
      this._attach();
      await this.send('EHLO mir-samozanyatyh');
      await this.expect(250);
    }
    if (this.user) {
      await this.send('AUTH LOGIN');
      await this.expect(334);
      await this.send(Buffer.from(this.user).toString('base64'));
      await this.expect(334);
      await this.send(Buffer.from(this.pass).toString('base64'));
      await this.expect(235);
    }
  }

  async sendMail({ from, to, subject, html }) {
    await this.send(`MAIL FROM:<${from}>`);
    await this.expect(250);
    await this.send(`RCPT TO:<${to}>`);
    await this.expect(250);
    await this.send('DATA');
    await this.expect(354);
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const body = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf8').toString('base64'),
      '',
      '.',
    ].join('\r\n');
    await this.send(body);
    const okLine = await this.expect(250);
    await this.send('QUIT');
    try {
      this.sock.destroy();
    } catch {
      /* ignore */
    }
    const messageId = /message-id[: ]<?([^>\r\n]*)>?/i.exec(okLine)?.[1];
    return { channel: 'email', to, message_id: messageId ?? null, verified: true };
  }
}

export async function sendDocumentEmail({ to, subject, html, doc }) {
  if (!config.SMTP_URL || !config.MAIL_FROM) {
    throw new Error('SMTP not configured (SMTP_URL / MAIL_FROM)');
  }
  const client = new SmtpClient(config.SMTP_URL);
  await client.connect();
  const result = await client.sendMail({ from: config.MAIL_FROM, to, subject, html });
  return {
    ...result,
    sent_at: new Date().toISOString(),
    document_id: doc?.id ?? null,
  };
}
