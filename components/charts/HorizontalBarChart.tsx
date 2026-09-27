import { useMemo } from 'react';
import { barX, defineChart } from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/react-charts';

export type BarDatum = { label: string; value: number };

// Shared horizontal bar chart for the dashboard/budgets/agent-activity
// pages — TanStack Charts' grammar-of-graphics API (marks + scales) rather
// than a chart-type prop, so every call site stays declarative about what
// it's plotting instead of picking from a fixed preset list.
export default function HorizontalBarChart({
  data,
  ariaLabel,
  valueFormat,
  color = '#4f46e5',
  rowHeight = 36,
}: {
  data: BarDatum[];
  ariaLabel: string;
  valueFormat?: (value: number) => string;
  color?: string;
  rowHeight?: number;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barX(data, {
            x: 'value',
            y: 'label',
            inset: 3,
            fill: color,
          }),
        ],
        scales: {
          y: {
            scale: () =>
              scaleBand<string>()
                .domain(data.map((d) => d.label))
                .padding(0.35),
          },
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: valueFormat ? { ticks: { format: valueFormat } } : undefined,
          },
        },
        tooltip,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(data), color, valueFormat]
  );

  if (data.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-gray-400">No data yet.</div>;
  }

  return (
    <Chart
      definition={definition}
      ariaLabel={ariaLabel}
      height={Math.max(120, data.length * rowHeight + 40)}
      initialWidth={560}
    />
  );
}
