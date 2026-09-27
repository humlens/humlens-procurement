import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { getSession } from '@/lib/session';
import { getTeams } from 'models/team';
import MarketingNav from '@/components/marketing/MarketingNav';
import Hero from '@/components/marketing/Hero';
import Features from '@/components/marketing/Features';
import AgentShowcase from '@/components/marketing/AgentShowcase';
import HowItWorks from '@/components/marketing/HowItWorks';
import CtaBand from '@/components/marketing/CtaBand';
import MarketingFooter from '@/components/marketing/MarketingFooter';

export default function Home() {
  return (
    <>
      <Head>
        <title>Humlens Procurement — AI-native purchasing for growing teams</title>
        <meta
          name="description"
          content="Requisitions, approvals, purchase orders, vendors, budgets, sourcing, and 3-way invoice matching in one place — with AI agents that clear the routine decisions and log everything they do."
        />
      </Head>
      <div className="bg-white">
        <MarketingNav />
        <main>
          <Hero />
          <Features />
          <AgentShowcase />
          <HowItWorks />
          <CtaBand />
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getSession(req as any, res as any);

  if (!session) {
    return { props: {} };
  }

  const teams = await getTeams(session.user.id);

  if (teams.length === 0) {
    return { redirect: { destination: '/teams/new', permanent: false } };
  }

  return { redirect: { destination: `/teams/${teams[0].slug}/dashboard`, permanent: false } };
};
