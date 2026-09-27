import { generateText } from 'ai';

import { prisma } from '@/lib/prisma';
import { logAgentAction } from 'models/agentAction';
import { getSpendAnomalyThresholdPct } from '@/lib/ai/policy';
import { agentModel } from '@/lib/ai/provider';

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start, end };
}

// Compares this month's paid spend, per vendor, against that vendor's
// trailing-3-month average. Flags vendors whose spend moved by more than
// the team's configured threshold — a cheap deterministic anomaly check,
// with an LLM call only to phrase a human-readable summary of the finding.
export async function runSpendAnomalyAgent(teamId: string) {
  const thresholdPct = await getSpendAnomalyThresholdPct(teamId);

  const current = monthRange(0);
  const trailing = [monthRange(1), monthRange(2), monthRange(3)];

  const currentSpend = await prisma.payment.groupBy({
    by: ['vendorId'],
    where: { teamId, status: 'PAID', paidAt: { gte: current.start, lt: current.end } },
    _sum: { amount: true },
  });

  const anomalies: { vendorId: string; currentAmount: number; averageAmount: number; variancePct: number }[] = [];

  for (const row of currentSpend) {
    const currentAmount = Number(row._sum.amount || 0);

    const trailingSums = await Promise.all(
      trailing.map(async (range) => {
        const sum = await prisma.payment.aggregate({
          where: { teamId, vendorId: row.vendorId, status: 'PAID', paidAt: { gte: range.start, lt: range.end } },
          _sum: { amount: true },
        });
        return Number(sum._sum.amount || 0);
      })
    );

    const averageAmount = trailingSums.reduce((a, b) => a + b, 0) / trailingSums.length;
    if (averageAmount === 0) continue;

    const variancePct = ((currentAmount - averageAmount) / averageAmount) * 100;
    if (Math.abs(variancePct) >= thresholdPct) {
      anomalies.push({ vendorId: row.vendorId, currentAmount, averageAmount, variancePct });
    }
  }

  if (anomalies.length === 0) {
    return null;
  }

  const vendors = await prisma.vendor.findMany({
    where: { id: { in: anomalies.map((a) => a.vendorId) } },
    select: { id: true, name: true },
  });
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name || id;

  const summaryLines = anomalies
    .map(
      (a) =>
        `${vendorName(a.vendorId)}: ${a.currentAmount.toFixed(0)} this month vs ${a.averageAmount.toFixed(0)} average (${a.variancePct > 0 ? '+' : ''}${a.variancePct.toFixed(0)}%)`
    )
    .join('\n');

  const { text } = await generateText({
    model: agentModel,
    prompt: `Summarize this spend anomaly finding for a procurement dashboard in 2-3 sentences, plain language, no markdown:\n\n${summaryLines}`,
  });

  return logAgentAction({
    teamId,
    type: 'SPEND_ANOMALY_ALERT',
    status: 'EXECUTED',
    input: { thresholdPct },
    output: { anomalies },
    reasoning: text,
  });
}
