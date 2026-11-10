import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Developers | InsyteAI',
  description: 'Put the InsyteAI voice tutor on your own site with one line of HTML.',
};

const code = 'block overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed';

export default function DevelopersPage() {
  return (
    <LegalPage
      title="Embed the AI tutor"
      intro={<p>Add the InsyteAI voice tutor to your own website or learning platform. You create an API key, paste one line of HTML, and learners can start a session on any topic you choose. Sessions use the credits of the account that owns the key.</p>}
      sections={[
        {
          heading: '1. Create an API key',
          body: (
            <>
              <p>Sign in and open <Link href="/learn/api-keys">API keys</Link>. Give the key a name.</p>
              <p>Allowed domains are optional. When a key has them, an API request is refused unless its <code>Origin</code> or <code>Referer</code> header names one of those sites, which includes server-side calls that send neither. The tutor in step 2 runs on <code>insyte.vercel.app</code> inside the frame, so a key used there needs either no allowed domains or <code>insyte.vercel.app</code> in the list. The list does not yet limit which sites can show the tutor in a frame.</p>
              <p>Treat a key like a password. If one leaks, turn it off on the same page and create a new one.</p>
            </>
          ),
        },
        {
          heading: '2. Add the tutor to your page',
          body: (
            <>
              <pre className={code}>{`<iframe
  src="https://insyte.vercel.app/embed/new?apiKey=YOUR_API_KEY&topic=Fractions"
  width="100%"
  height="600"
  frameborder="0"
  allow="microphone"
></iframe>`}</pre>
              <p>The <code>allow=&quot;microphone&quot;</code> attribute is required: without it the browser blocks the learner&rsquo;s microphone and the tutor cannot hear them.</p>
            </>
          ),
        },
        {
          heading: '3. Options',
          body: (
            <>
              <p>Add these to the address in <code>src</code>. Values must be URL-encoded.</p>
              <ul>
                <li><strong>apiKey</strong> (required): your key.</li>
                <li><strong>topic</strong>: what the session is about, for example <code>topic=Photosynthesis</code>. Without it the learner is asked.</li>
                <li><strong>theme</strong>: <code>light</code> or <code>dark</code>. The default is light.</li>
                <li><strong>accent</strong>: your brand colour as a hex value without the #, for example <code>accent=1d4ed8</code>. Buttons and highlights use it.</li>
                <li><strong>getFeedback</strong>: <code>true</code> asks the learner for a short rating when the session ends.</li>
              </ul>
              <pre className={code}>{`/embed/new?apiKey=YOUR_API_KEY&topic=Fractions&theme=dark&accent=1d4ed8`}</pre>
            </>
          ),
        },
        {
          heading: '4. Sessions from your own code',
          body: (
            <>
              <p>Your server can list the sessions a key has started. Send the key in the <code>Authorization</code> header.</p>
              <pre className={code}>{`curl https://insyte.vercel.app/api/embed/sessions?limit=50 \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</pre>
              <p>The answer is a list of sessions with their id, topic, status and start and end times. <code>limit</code> can be from 1 to 200.</p>
            </>
          ),
        },
        {
          heading: 'Limits and errors',
          body: (
            <ul>
              <li><strong>Rate limits:</strong> each key has an hourly and a daily request limit, shown on the API keys page. Going over returns <code>429</code>.</li>
              <li><strong>Credits:</strong> a session needs at least one credit on the owning account. Without it the answer is <code>402</code> with the code <code>INSUFFICIENT_CREDITS</code>.</li>
              <li><strong>Domains:</strong> a request from a site that is not on the key&rsquo;s allowed list is refused.</li>
              <li><strong>Keys:</strong> a missing, expired or switched-off key returns <code>401</code>.</li>
            </ul>
          ),
        },
        {
          heading: 'Watching usage',
          body: <p>Each key on the <Link href="/learn/api-keys">API keys</Link> page has a &ldquo;Usage in the last 30 days&rdquo; panel with requests and sessions per day, so you can see when a site is active and catch a key that is being used more than you expect.</p>,
        },
      ]}
    />
  );
}
