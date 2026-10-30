import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { Button } from '@/components/ui/button';
import { publicSupportEmail } from '@/lib/support';

export const metadata: Metadata = { title: 'Support | InsyteAI' };

export default function SupportPage() {
  const email = publicSupportEmail();
  return (
    <LegalPage
      title="Contact support"
      intro={<p>Found a problem, have an idea for a feature, or need help with your account or billing? The InsyteAI team reads every message.</p>}
      sections={[
        {
          heading: 'If you have an account',
          body: (
            <>
              <p>Sign in and choose <strong>Help &amp; feedback</strong> in your account menu (bottom of the sidebar). You can follow our replies there, and we&rsquo;ll also email you.</p>
              <p><Button asChild><Link href="/help">Open Help &amp; feedback</Link></Button></p>
            </>
          ),
        },
        {
          heading: 'Can’t sign in?',
          body: email ? (
            <p>Email us at <a href={`mailto:${email}`} className="font-medium underline underline-offset-2">{email}</a> with the email address you use for InsyteAI. If you&rsquo;re a student or teacher at a school, your school administrator can also reset your password.</p>
          ) : (
            <p>Use <Link href="/forgot-password" className="font-medium underline underline-offset-2">Forgot password</Link> on the sign-in page. If you&rsquo;re a student or teacher at a school, your school administrator can also reset your password.</p>
          ),
        },
        {
          heading: 'Questions about classes or homework',
          body: <p>Your teacher or school can usually help fastest with classes, homework, marks and timetables.</p>,
        },
      ]}
    />
  );
}
