import { redirect } from 'next/navigation';

// The content library lists every type on one page now.
export default function Page() {
  redirect('/teachers/content?type=worksheet');
}
