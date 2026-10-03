import { COMMISSION_SERVICE_LABELS, describeRate, whenCharged } from "@/lib/commission/terms";
import type { RatesView } from "@/lib/services/commission";
import { COMMISSION_SERVICES, type CommissionService } from "@/lib/vocab";

/** The rates in force, one row per service. `services` limits it to what the partner offers. */
export function CommissionRates({ rates, services = COMMISSION_SERVICES, you = true, gstPercent }: { rates: RatesView; services?: readonly CommissionService[]; you?: boolean; gstPercent: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="wtable">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Commission</th>
            <th scope="col">Charged</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s}>
              <td className="font-medium">{COMMISSION_SERVICE_LABELS[s]}</td>
              <td>
                {describeRate(s, rates[s], you)}
                {rates[s].custom && <span className="ml-2 rounded-full bg-sage/15 px-1.5 py-0.5 text-[0.6875rem] text-sage-deep">Your own rate</span>}
              </td>
              <td className="text-stone-deep">{whenCharged(s, you)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gstPercent > 0 && <p className="mt-3 px-1 text-[0.75rem] text-stone-deep">GST at {gstPercent}% is added to each commission.</p>}
    </div>
  );
}
