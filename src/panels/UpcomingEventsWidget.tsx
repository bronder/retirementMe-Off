/** Upcoming life-events widget — extracted with OverviewPanel so the
 *  lazily-loaded panel doesn't depend on App.tsx. Shows at a glance which
 *  life events are configured and when they'll fire. */
import { Home, House, Car, CircleDollarSign, ClipboardList, CalendarClock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePlanStore } from '../store';
import { formatCurrency, prettify } from '../format';
import { Glyph } from '../ui/shared';
import type { EventType } from '../types';

/* ============ UPCOMING EVENTS WIDGET ============
   Shown on the Summary page so users can see at a glance which life
   events are configured and when they'll fire. The current net-worth
   card always reflects *today's* state, so future events don't appear
   there — this widget makes them visible without forcing the user to
   dig into the Life Events panel. */

const EVENT_ICON: Record<EventType, LucideIcon> = {
  home_purchase: Home,
  home_sale: House,
  large_purchase: Car,
  windfall: CircleDollarSign,
  other: ClipboardList,
};

export function UpcomingEventsWidget({
  scenario,
  currentAge,
}: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  currentAge: number;
}) {
  // Pull the next 5 events sorted by age. "Upcoming" = age >= currentAge.
  // We also include events that already happened (age < currentAge) so users
  // can see "yep, this event has already been applied" — but tag them as past.
  const upcoming = scenario.events
    .slice()
    .sort((a, b) => a.age - b.age)
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <div className="upcoming-events-widget">
        <div className="upcoming-events-header"><CalendarClock size={15} aria-hidden="true" /> Upcoming Life Events</div>
        <div className="upcoming-events-empty">
          No life events yet. Add a windfall, home purchase, or other one-time event to see how it
          affects your plan. <span className="muted">(Events impact net worth and other projections.)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="upcoming-events-widget">
      <div className="upcoming-events-header">
        <CalendarClock size={15} aria-hidden="true" /> Upcoming Life Events
        <span className="upcoming-events-hint">
          These will affect your projection at the indicated age.
        </span>
      </div>
      <div className="upcoming-events-list">
        {upcoming.map((ev) => {
          const isPast = ev.age < currentAge;
          const netAmount = ev.proceeds - ev.cost;
          const ongoing = ev.ongoingAnnualImpact;
          return (
            <div
              key={ev.id}
              className={`upcoming-event-row ${isPast ? 'past' : ''}`}
              title={isPast ? 'This event has already been applied to your current net worth' : 'Future event — not yet reflected in current net worth'}
            >
              <span className="upcoming-event-icon"><Glyph i={EVENT_ICON[ev.type] ?? ClipboardList} /></span>
              <span className="upcoming-event-name">{ev.name || prettify(ev.type)}</span>
              <span className="upcoming-event-age">
                {isPast ? `Past (age ${ev.age})` : `Age ${ev.age}`}
              </span>
              {netAmount !== 0 && (
                <span
                  className="upcoming-event-amount"
                  style={{ color: netAmount > 0 ? 'var(--green)' : 'var(--red)' }}
                >
                  {netAmount > 0 ? '+' : ''}
                  {formatCurrency(netAmount, { compact: true })}
                </span>
              )}
              {ongoing !== 0 && (
                <span className="upcoming-event-ongoing" title="Ongoing annual impact (inflation-adjusted)">
                  {ongoing > 0 ? '+' : ''}
                  {formatCurrency(ongoing, { compact: true })}/yr
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
