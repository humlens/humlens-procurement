import type { GetServerSidePropsContext } from 'next';

import { getSession } from '@/lib/session';
import { getTeamMember } from 'models/team';

// Server-side guard for /teams/[slug]/** pages: redirects to login if
// unauthenticated, 404s if the user isn't on this team, and otherwise hands
// back their role so pages can gate UI (e.g. hide "Approve" for a Requester).
export async function requireTeamPage(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx.req as any, ctx.res as any);

  if (!session) {
    return { redirect: { destination: '/auth/login', permanent: false } } as const;
  }

  const slug = ctx.params?.slug as string;

  try {
    const teamMember = await getTeamMember(session.user.id, slug);
    return {
      props: {
        role: teamMember.role,
        slug,
        userId: session.user.id,
        userEmail: session.user.email,
      },
    } as const;
  } catch {
    return { notFound: true } as const;
  }
}
