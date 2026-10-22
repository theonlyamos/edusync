import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Terms | InsyteAI' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="22 October 2026"
      intro={<p>These terms apply to everyone who uses InsyteAI: schools, teachers, students and individual learners. By signing in or using the service you agree to them. If you use InsyteAI through a school, your school&rsquo;s own rules also apply.</p>}
      sections={[
        {
          heading: 'Accounts',
          body: (
            <ul>
              <li>Keep your password private and don&rsquo;t share your account.</li>
              <li>Schools are responsible for the users they invite and for keeping their details up to date.</li>
              <li>We may suspend an account that is misused or puts other users at risk.</li>
            </ul>
          ),
        },
        {
          heading: 'Using InsyteAI well',
          body: (
            <ul>
              <li>Use it for learning and teaching.</li>
              <li>Don&rsquo;t upload or ask for anything harmful, hateful, sexual or illegal, or anything that isn&rsquo;t yours to share.</li>
              <li>Follow your teacher&rsquo;s instructions on homework, including when AI help is paused.</li>
              <li>Don&rsquo;t try to break, overload or get around the security of the service.</li>
            </ul>
          ),
        },
        {
          heading: 'AI answers',
          body: <p>The AI tutor and other AI tools can make mistakes. Check important facts with your teacher or your lesson materials. AI answers are a learning aid, not a replacement for teachers.</p>,
        },
        {
          heading: 'Content',
          body: <p>Schools and teachers keep ownership of the lessons and materials they create. You give us permission to store and process that content so we can provide the service. Students keep ownership of their own work.</p>,
        },
        {
          heading: 'Credits and payments',
          body: <p>Some features use credits, for example voice tutoring and live classes. Credit prices and free allowances are shown before you buy. Payments are processed by Stripe. Credits are not cash and cannot be exchanged for money, except where the law requires a refund.</p>,
        },
        {
          heading: 'Availability',
          body: <p>We work to keep InsyteAI available and secure, but we can&rsquo;t promise it will always be free of interruptions or errors. We may change or remove features over time.</p>,
        },
        {
          heading: 'Changes to these terms',
          body: <p>If we change these terms, we will update the date at the top of this page. Continuing to use InsyteAI after a change means you accept the new terms.</p>,
        },
      ]}
    />
  );
}
