import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Privacy | InsyteAI' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="22 October 2026"
      intro={<p>InsyteAI is a learning platform that schools use with their teachers and students. This page explains what information we collect, why, and who we share it with. Most student accounts are created and managed by a school, so the school decides who can use InsyteAI and can ask us to correct or delete its users&rsquo; information.</p>}
      sections={[
        {
          heading: 'What we collect',
          body: (
            <ul>
              <li><strong>Account details:</strong> name, email address, role (student, teacher or administrator), school and grade.</li>
              <li><strong>Learning activity:</strong> lessons opened, practice answers and scores, homework answers, marks and teacher feedback, and messages sent to the AI tutor or study companion.</li>
              <li><strong>Voice and live classes:</strong> when you use the voice tutor or join a live class, your microphone audio (and camera, if you turn it on) is streamed to provide that session.</li>
              <li><strong>Payments:</strong> when a school or user buys credits, payment is handled by Stripe. We do not see or store card numbers.</li>
              <li><strong>Technical data:</strong> basic logs such as IP address, browser and error reports, used to keep the service secure and working.</li>
            </ul>
          ),
        },
        {
          heading: 'How we use it',
          body: (
            <ul>
              <li>To run lessons, homework, practice, live classes and the AI tutor.</li>
              <li>To show students, teachers and school administrators progress and results.</li>
              <li>To manage credits and billing for schools.</li>
              <li>To keep the service secure and fix problems.</li>
            </ul>
          ),
        },
        {
          heading: 'AI features',
          body: <p>When you use the AI tutor, study companion, practice generator or visuals, the text or audio you send and the related lesson content are processed by our AI providers (Google Gemini, with OpenAI as a backup) to produce a response. We do not use students&rsquo; information to advertise to them.</p>,
        },
        {
          heading: 'Who we share it with',
          body: (
            <>
              <p>We share information only with services that help us run InsyteAI, and only for that purpose:</p>
              <ul>
                <li>Supabase (database and sign-in) and Vercel (hosting)</li>
                <li>Google and OpenAI (AI responses)</li>
                <li>LiveKit (live classes and voice sessions)</li>
                <li>Stripe (payments) and Resend (account emails such as invites and password resets)</li>
              </ul>
              <p>Within a school, teachers and school administrators can see the work and results of students in their school. We do not sell personal information.</p>
            </>
          ),
        },
        {
          heading: 'Children',
          body: <p>Students are usually under 18. Their accounts are created by, or with the permission of, their school, and the school is responsible for having the consent it needs from parents or guardians. Parents who have questions about their child&rsquo;s information should contact the school first.</p>,
        },
        {
          heading: 'Keeping and deleting information',
          body: <p>We keep information while the account or school is active. A school administrator can remove users, and a school can ask us to delete its information. Some records, such as payment records, may be kept longer where the law requires.</p>,
        },
        {
          heading: 'Your choices',
          body: <p>You can ask to see, correct or delete your information through your school administrator. If you are not part of a school, contact us through the InsyteAI website.</p>,
        },
        {
          heading: 'Changes',
          body: <p>If we change this policy, we will update the date at the top of this page.</p>,
        },
      ]}
    />
  );
}
