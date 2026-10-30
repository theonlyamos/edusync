import { describe, expect, it } from 'vitest'
import { buildReplyEmail, buildStaffAlertEmail, cleanPagePath, helpPath, parseMessage, parseNewRequest, preview } from '@/lib/support'
import { helpMenuHref } from '@/components/layout/ProfileMenu'

describe('parseNewRequest', () => {
  const good = { category: 'problem', subject: '  Homework   won’t submit ', message: ' It spins forever.\r\n\r\nOn Chrome. ', pagePath: '/students/homework/1', portal: 'school' }

  it('cleans a valid request', () => {
    expect(parseNewRequest(good)).toEqual({
      ok: true,
      value: { category: 'problem', subject: 'Homework won’t submit', message: 'It spins forever.\n\nOn Chrome.', pagePath: '/students/homework/1', portal: 'school' },
    })
  })

  it('needs a known category, a subject and a message', () => {
    expect(parseNewRequest({ ...good, category: 'spam' }).ok).toBe(false)
    expect(parseNewRequest({ ...good, subject: '   ' }).ok).toBe(false)
    expect(parseNewRequest({ ...good, message: '' }).ok).toBe(false)
    expect(parseNewRequest(null).ok).toBe(false)
  })

  it('limits lengths', () => {
    expect(parseNewRequest({ ...good, subject: 'x'.repeat(151) }).ok).toBe(false)
    expect(parseNewRequest({ ...good, message: 'x'.repeat(5001) }).ok).toBe(false)
  })

  it('treats any portal other than school as the general help page', () => {
    const parsed = parseNewRequest({ ...good, portal: 'admin' })
    expect(parsed.ok && parsed.value.portal).toBe('help')
  })
})

describe('cleanPagePath', () => {
  it('keeps in-app paths only', () => {
    expect(cleanPagePath('/teachers/lessons?tab=draft')).toBe('/teachers/lessons?tab=draft')
    expect(cleanPagePath('https://evil.example')).toBeNull()
    expect(cleanPagePath('//evil.example')).toBeNull()
    expect(cleanPagePath('/a b')).toBeNull()
    expect(cleanPagePath('/\\evil')).toBeNull()
    expect(cleanPagePath(42)).toBeNull()
    expect(cleanPagePath('/' + 'a'.repeat(400))?.length).toBe(300)
  })
})

describe('parseMessage', () => {
  it('rejects empty and long messages', () => {
    expect(parseMessage('  ').ok).toBe(false)
    expect(parseMessage('x'.repeat(5001)).ok).toBe(false)
    expect(parseMessage(' thanks ')).toEqual({ ok: true, value: 'thanks' })
  })
})

describe('helpers', () => {
  it('previews the start of a message on one line', () => {
    expect(preview('a\n\nb')).toBe('a b')
    expect(preview('x'.repeat(200), 10)).toBe('xxxxxxxxx…')
    expect(preview(null)).toBeNull()
  })

  it('links replies to the right portal', () => {
    expect(helpPath('school')).toBe('/school/help')
    expect(helpPath('help')).toBe('/help')
    expect(helpPath(null)).toBe('/help')
  })

  it('builds the account menu link with the current page', () => {
    expect(helpMenuHref('admin', '/admin/dashboard')).toBeNull()
    expect(helpMenuHref('student', '/students/homework')).toBe('/help?from=%2Fstudents%2Fhomework')
    expect(helpMenuHref('school', '/school/students')).toBe('/school/help?from=%2Fschool%2Fstudents')
    expect(helpMenuHref('teacher', '/help')).toBe('/help')
  })
})

describe('emails', () => {
  it('escapes what people typed in the staff alert', () => {
    const email = buildStaffAlertEmail({
      kind: 'new',
      category: 'complaint',
      subject: '<script>x</script>',
      message: 'line one\n<b>bold</b>',
      from: { name: 'Ama', email: 'ama@example.com', role: 'teacher' },
      schoolName: 'Hill School',
      url: 'https://app.test/admin/support/1',
    })
    expect(email.subject).toBe('[Support] Complaint: <script>x</script>')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(email.html).toContain('line one<br>')
    expect(email.text).toContain('ama@example.com · teacher · Hill School')
  })

  it('tells the person a resolved request reopens when they reply', () => {
    const email = buildReplyEmail({ name: 'Ama', subject: 'Login', reply: 'Fixed!', status: 'resolved', url: 'https://app.test/help?request=1' })
    expect(email.subject).toBe('Re: Login')
    expect(email.text).toContain('it will reopen')
    expect(email.html).toContain('https://app.test/help?request=1')
  })
})
